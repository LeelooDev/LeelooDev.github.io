import { useEffect, useRef } from 'react'

// 火星自转轴相对轨道面倾斜 25.19°，照着真实数值摆，自转看起来才不像地球仪。
const AXIAL_TILT = (25.19 * Math.PI) / 180

interface MarsSceneProps {
  label: string
}

export function MarsScene({ label }: MarsSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let cancelled = false
    let frame = 0
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null
    let renderer: import('three').WebGLRenderer | null = null
    let model: import('three').Object3D | null = null

    async function setup() {
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (cancelled || !mount) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000)
      const tiltGroup = new THREE.Group()
      const spinGroup = new THREE.Group()
      // 先绕 z 轴倒下 25.19°，再绕 x 轴抬一点，让北极冠落在画面上半部。
      tiltGroup.rotation.set(0.12, 0, -AXIAL_TILT)
      tiltGroup.add(spinGroup)
      scene.add(tiltGroup)

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.domElement.setAttribute('aria-hidden', 'true')
      mount.append(renderer.domElement)

      // 火星反照率只有 0.25 左右，比土星暗得多，主光要给足才不会糊成一团深红。
      const hemisphere = new THREE.HemisphereLight(0xffe9d5, 0x140a06, 1.4)
      const key = new THREE.DirectionalLight(0xfff0dc, 4.6)
      const rim = new THREE.DirectionalLight(0x9dc9ff, 2.6)
      key.position.set(-4.5, 3.4, 6)
      rim.position.set(5, 1.6, -4)
      scene.add(hemisphere, key, rim)

      function applyTheme() {
        const isLight = document.body.dataset.theme === 'light'
        hemisphere.color.set(isLight ? 0xffffff : 0xffe0c4)
        hemisphere.groundColor.set(isLight ? 0x7a6a5c : 0x0a0603)
        hemisphere.intensity = isLight ? 1.5 : 1.15
        key.color.set(isLight ? 0xfff6ea : 0xffe2bd)
        key.intensity = isLight ? 3.6 : 4.6
        // 深色背景下靠冷调轮廓光把星球边缘从底色里拉出来，浅色背景不需要这么强。
        rim.color.set(isLight ? 0xc3ddff : 0x7cb6ff)
        rim.intensity = isLight ? 1.1 : 3.4
        if (renderer) renderer.toneMappingExposure = isLight ? 0.98 : 1.22
      }

      applyTheme()
      themeObserver = new MutationObserver(applyTheme)
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })

      function resize() {
        if (!renderer || !mount) return
        const { width, height } = mount.getBoundingClientRect()
        if (!width || !height) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(mount)
      resize()

      const loader = new GLTFLoader()
      loader.load(
        '/models/mars-nasa.glb',
        (gltf) => {
          if (cancelled) return
          model = gltf.scene
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.castShadow = false
            object.receiveShadow = false
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach((material) => {
              material.needsUpdate = true
            })
          })

          const bounds = new THREE.Box3().setFromObject(model)
          const center = bounds.getCenter(new THREE.Vector3())
          const size = bounds.getSize(new THREE.Vector3())
          model.position.sub(center)
          spinGroup.add(model)

          // 别用 Box3.getBoundingSphere()：那是包围盒的外接球，对一颗球来说半径要乘 √3，
          // 拿它算距离会把相机白白多推远 73%，星球怎么调都显小。最长边的一半才是真实半径。
          const radius = Math.max(size.x, size.y, size.z) / 2
          const verticalFov = THREE.MathUtils.degToRad(camera.fov)
          // 土星那版故意让环出画；火星没有环，整颗球顶着画布内切，只留一丝抗锯齿余量。
          const distance = (radius / Math.sin(verticalFov / 2)) * 1.02
          camera.position.set(0, radius * 0.04, distance)
          camera.near = Math.max(distance / 100, 0.01)
          camera.far = distance * 10
          camera.lookAt(0, 0, 0)
          camera.updateProjectionMatrix()
          mount.dataset.loaded = 'true'
        },
        undefined,
        () => {
          if (!cancelled) mount.dataset.error = 'true'
        },
      )

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      let previousTime = performance.now()
      function render(time = performance.now()) {
        if (cancelled || !renderer) return
        const delta = Math.min((time - previousTime) / 1000, 0.05)
        previousTime = time
        // 约 52 秒转一圈：肉眼看得出在动，又不至于让人盯着页面发晕。
        if (!reducedMotion && model) spinGroup.rotation.y += delta * 0.12
        renderer.render(scene, camera)
        frame = window.requestAnimationFrame(render)
      }
      render()
    }

    setup().catch(() => {
      if (!cancelled && mount) mount.dataset.error = 'true'
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      themeObserver?.disconnect()
      if (model) {
        model.traverse((object) => {
          const mesh = object as import('three').Mesh
          if (!mesh.isMesh) return
          mesh.geometry?.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach((material) => {
            Object.values(material).forEach((value) => {
              if (value && typeof value === 'object' && 'isTexture' in value) {
                ;(value as import('three').Texture).dispose()
              }
            })
            material.dispose()
          })
        })
      }
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [])

  return (
    <div className="mars-stage" ref={mountRef} role="img" aria-label={label}>
      <div className="mars-loader" aria-hidden="true"><i /></div>
      <div className="mars-error" aria-hidden="true">MARS</div>
    </div>
  )
}
