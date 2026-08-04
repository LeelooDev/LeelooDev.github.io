import { useEffect, useRef } from 'react'

interface SaturnSceneProps {
  label: string
}

export function SaturnScene({ label }: SaturnSceneProps) {
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
      tiltGroup.rotation.set(0.14, 0, -0.16)
      tiltGroup.add(spinGroup)
      scene.add(tiltGroup)

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.domElement.setAttribute('aria-hidden', 'true')
      mount.append(renderer.domElement)

      const hemisphere = new THREE.HemisphereLight(0xf5f8ff, 0x17130f, 1.8)
      const key = new THREE.DirectionalLight(0xffe7c6, 4.2)
      const rim = new THREE.DirectionalLight(0xaad7ff, 3.2)
      key.position.set(-4, 4, 6)
      rim.position.set(5, 2, -4)
      scene.add(hemisphere, key, rim)

      function applyTheme() {
        const isLight = document.body.dataset.theme === 'light'
        hemisphere.color.set(isLight ? 0xffffff : 0xcfe4ff)
        hemisphere.groundColor.set(isLight ? 0x6f665d : 0x03070d)
        hemisphere.intensity = isLight ? 1.45 : 1.45
        key.color.set(isLight ? 0xfff2dd : 0xffd7aa)
        key.intensity = isLight ? 3.25 : 4.0
        rim.color.set(isLight ? 0xbedcff : 0x78bfff)
        rim.intensity = isLight ? 1.7 : 4.8
        if (renderer) renderer.toneMappingExposure = isLight ? 0.96 : 1.28
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
        '/models/saturn-nasa.glb',
        (gltf) => {
          if (cancelled) return
          model = gltf.scene
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.castShadow = false
            object.receiveShadow = false
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach((material) => {
              material.side = THREE.DoubleSide
              material.needsUpdate = true
            })
          })

          const bounds = new THREE.Box3().setFromObject(model)
          const sphere = bounds.getBoundingSphere(new THREE.Sphere())
          model.position.sub(sphere.center)
          spinGroup.add(model)

          const verticalFov = THREE.MathUtils.degToRad(camera.fov)
          // SpaceX-inspired framing: the planet intentionally overfills its stage so the
          // hero viewport crops the outer rings instead of presenting a small model icon.
          const distance = sphere.radius / Math.sin(verticalFov / 2) * 0.62
          camera.position.set(0, sphere.radius * 0.03, distance)
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
        if (!reducedMotion && model) spinGroup.rotation.y += delta * 0.16
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
    <div className="saturn-stage" ref={mountRef} role="img" aria-label={label}>
      <div className="saturn-loader" aria-hidden="true"><i /><span /></div>
      <div className="saturn-error" aria-hidden="true">SATURN</div>
    </div>
  )
}
