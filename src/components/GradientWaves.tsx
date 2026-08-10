import { useEffect, useRef } from 'react'

// 移植自 reactbits.dev 的 Gradient Waves 背景（原版依赖 ogl）。
// 场景只是一个全屏三角形 + raymarching 片元着色器，直接用原生 WebGL2 写省掉整个库。
// 颜色不走原版的紫色系，从站点的祖母绿 --accent(#10b981) 派生，明暗主题各一组。
const THEME_COLORS = {
  dark: { horizon: '#123f31', wave: '#071e18', crest: '#2fc593' },
  light: { horizon: '#7fd4b4', wave: '#e4f7ee', crest: '#ffffff' },
}

// 波形参数沿用 reactbits 默认值，speed 略降——hero 是阅读入口，背景动得太快会抢注意力。
const PARAMS = {
  speed: 0.3,
  amplitude: 2.5,
  waveScale: 0.6,
  waveRatio: 0.9,
  swell: 35,
  turbulence: 20,
  tilt: 1.11,
  zoom: 1.0,
  height: 5.5,
  fogDepth: 15,
  steps: 70,
  brightness: 1.0,
  opacity: 1.0,
  grainIntensity: 0.05,
  parallax: 0.5,
}

const VERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
  float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
  c = cos(yaw); s = sin(yaw);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
  c = cos(pitch); s = sin(pitch);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
  alpha += (g - 0.5) * uGrainIntensity;
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return [1, 1, 1]
  return [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function GradientWaves() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const canvas = document.createElement('canvas')
    // 着色器输出的是预乘 alpha（rgb * a），上下文要声明一致，否则雾化边缘会发灰。
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
    // 拿不到 WebGL2 就静默降级——hero 底下本来就是纯色背景，缺了波浪不影响阅读。
    if (!gl) return

    const vert = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    if (!vert || !frag) return
    const program = gl.createProgram()
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    // 一个盖满裁剪空间的大三角形，比两个三角形拼四边形少一条对角线接缝。
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const positionLoc = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(program, name)
    const uTime = u('iTime')
    const uResolution = u('iResolution')
    const uMouse = u('uMouse')

    gl.uniform1f(u('uSpeed'), PARAMS.speed)
    gl.uniform1f(u('uAmplitude'), PARAMS.amplitude)
    gl.uniform1f(u('uWaveScale'), PARAMS.waveScale)
    gl.uniform1f(u('uWaveRatio'), PARAMS.waveRatio)
    gl.uniform1f(u('uSwell'), PARAMS.swell)
    gl.uniform1f(u('uTurbulence'), PARAMS.turbulence)
    gl.uniform1f(u('uTilt'), PARAMS.tilt)
    gl.uniform1f(u('uZoom'), PARAMS.zoom)
    gl.uniform1f(u('uHeight'), PARAMS.height)
    gl.uniform1f(u('uFogDepth'), PARAMS.fogDepth)
    gl.uniform1f(u('uSteps'), PARAMS.steps)
    gl.uniform1f(u('uBrightness'), PARAMS.brightness)
    gl.uniform1f(u('uOpacity'), PARAMS.opacity)
    gl.uniform1f(u('uGrainIntensity'), PARAMS.grainIntensity)
    gl.uniform1f(u('uParallax'), PARAMS.parallax)

    const uHorizon = u('uHorizonColor')
    const uWave = u('uWaveColor')
    const uCrest = u('uCrestColor')

    function applyTheme() {
      if (!gl) return
      const colors = document.body.dataset.theme === 'light' ? THEME_COLORS.light : THEME_COLORS.dark
      gl.uniform3fv(uHorizon, hexToRgb(colors.horizon))
      gl.uniform3fv(uWave, hexToRgb(colors.wave))
      gl.uniform3fv(uCrest, hexToRgb(colors.crest))
    }
    applyTheme()

    canvas.setAttribute('aria-hidden', 'true')
    mount.append(canvas)

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let frame = 0
    let running = false
    let inViewport = true
    // 视口外或标签页切走时整个渲染循环停掉，别让一块装饰背景一直烧 GPU。
    let pageVisible = !document.hidden
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }

    function renderFrame(now = performance.now()) {
      if (!gl) return
      mouse.x += 0.05 * (mouse.tx - mouse.x)
      mouse.y += 0.05 * (mouse.ty - mouse.y)
      gl.uniform1f(uTime, (now - start) * 0.001)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    function loop(now: number) {
      renderFrame(now)
      frame = window.requestAnimationFrame(loop)
    }
    function tryStart() {
      // 减弱动效偏好下不进循环：波浪停在第一帧当静态渐变用。
      if (reducedMotion || running || !inViewport || !pageVisible) return
      running = true
      frame = window.requestAnimationFrame(loop)
    }
    function tryStop() {
      if (!running) return
      running = false
      window.cancelAnimationFrame(frame)
    }

    function resize() {
      if (!gl || !mount) return
      const { width, height } = mount.getBoundingClientRect()
      if (!width || !height) return
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uResolution, canvas.width, canvas.height)
      renderFrame()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    const themeObserver = new MutationObserver(() => {
      applyTheme()
      renderFrame()
    })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })

    // canvas 层 pointer-events 是 none（内容在它上面），事件挂到 hero 容器上才能收到。
    const pointerHost = mount.parentElement ?? mount
    function onPointerMove(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      mouse.tx = (event.clientX - rect.left) / rect.width
      mouse.ty = 1 - (event.clientY - rect.top) / rect.height
    }
    function onPointerLeave() {
      mouse.tx = 0.5
      mouse.ty = 0.5
    }
    pointerHost.addEventListener('pointermove', onPointerMove)
    pointerHost.addEventListener('pointerleave', onPointerLeave)

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting
      inViewport ? tryStart() : tryStop()
    })
    intersectionObserver.observe(mount)

    function onVisibility() {
      pageVisible = !document.hidden
      pageVisible ? tryStart() : tryStop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    tryStart()
    if (reducedMotion) renderFrame()

    return () => {
      tryStop()
      resizeObserver.disconnect()
      themeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      pointerHost.removeEventListener('pointermove', onPointerMove)
      pointerHost.removeEventListener('pointerleave', onPointerLeave)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [])

  return <div className="hero-waves" ref={mountRef} aria-hidden="true" />
}
