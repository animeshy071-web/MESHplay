import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'

export interface GradientWavesProps {
  horizonColor?: string
  waveColor?: string
  crestColor?: string
  speed?: number
  amplitude?: number
  waveScale?: number
  waveRatio?: number
  swell?: number
  turbulence?: number
  tilt?: number
  zoom?: number
  height?: number
  fogDepth?: number
  detail?: 'low' | 'medium' | 'high'
  brightness?: number
  opacity?: number
  mouseInteraction?: boolean
  parallaxStrength?: number
  grain?: boolean
  grainIntensity?: number
  className?: string
  style?: React.CSSProperties
}

const hexToRgbArr = (hex: string): [number, number, number] => {
  const s = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return s
    ? [parseInt(s[1], 16) / 255, parseInt(s[2], 16) / 255, parseInt(s[3], 16) / 255]
    : [1, 1, 1]
}

const getSteps = (detail: 'low' | 'medium' | 'high' = 'medium') => {
  return detail === 'low' ? 40 : detail === 'high' ? 110 : 70
}

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
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
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
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

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`

interface ContextStore {
  renderer: Renderer
  program: Program
  mesh: Mesh
}

const contextMap = new WeakMap<HTMLDivElement, ContextStore>()

export default function GradientWaves({
  horizonColor = '#5227FF',
  waveColor = '#FF9FFC',
  crestColor = '#FFFFFF',
  speed = 0.4,
  amplitude = 2.5,
  waveScale = 0.6,
  waveRatio = 0.9,
  swell = 35,
  turbulence = 20,
  tilt = 1.11,
  zoom = 1.0,
  height = 5.5,
  fogDepth = 15,
  detail = 'medium',
  brightness = 1.0,
  opacity = 1.0,
  mouseInteraction = true,
  parallaxStrength = 0.5,
  grain = true,
  grainIntensity = 0.05,
  className = '',
  style = {},
}: GradientWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const enableMouseRef = useRef(mouseInteraction)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: Renderer | null = null
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      })
    } catch {
      return
    }

    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    container.appendChild(canvas)

    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uWaveScale: { value: waveScale },
        uWaveRatio: { value: waveRatio },
        uSwell: { value: swell },
        uTurbulence: { value: turbulence },
        uTilt: { value: tilt },
        uZoom: { value: zoom },
        uHeight: { value: height },
        uFogDepth: { value: fogDepth },
        uSteps: { value: getSteps(detail) },
        uBrightness: { value: brightness },
        uOpacity: { value: opacity },
        uGrain: { value: grain ? 1 : 0 },
        uGrainIntensity: { value: grainIntensity },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uParallax: { value: parallaxStrength },
        uEnableMouse: { value: mouseInteraction },
        uHorizonColor: { value: new Float32Array(hexToRgbArr(horizonColor)) },
        uWaveColor: { value: new Float32Array(hexToRgbArr(waveColor)) },
        uCrestColor: { value: new Float32Array(hexToRgbArr(crestColor)) },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })
    contextMap.set(container, { renderer, program, mesh })

    const handleResize = () => {
      const rect = container.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      renderer!.setSize(w, h)
      const res = program.uniforms.iResolution.value as Float32Array
      res[0] = gl.drawingBufferWidth
      res[1] = gl.drawingBufferHeight
      renderer!.render({ scene: mesh })
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    handleResize()

    const currentMouse = [0.5, 0.5]
    const targetMouse = [0.5, 0.5]

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      targetMouse[0] = (e.clientX - rect.left) / rect.width
      targetMouse[1] = 1 - (e.clientY - rect.top) / rect.height
    }

    const handlePointerLeave = () => {
      targetMouse[0] = 0.5
      targetMouse[1] = 0.5
    }

    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    let rafId = 0
    let isIntersecting = true
    let isTabVisible = !document.hidden
    const startTime = performance.now()

    const animate = (now: number) => {
      program.uniforms.iTime.value = (now - startTime) * 0.001
      const mx = enableMouseRef.current ? targetMouse[0] : 0.5
      const my = enableMouseRef.current ? targetMouse[1] : 0.5
      currentMouse[0] += 0.05 * (mx - currentMouse[0])
      currentMouse[1] += 0.05 * (my - currentMouse[1])
      const uMouseVal = program.uniforms.uMouse.value as Float32Array
      uMouseVal[0] = currentMouse[0]
      uMouseVal[1] = currentMouse[1]

      renderer!.render({ scene: mesh })
      rafId = requestAnimationFrame(animate)
    }

    const startLoop = () => {
      if (isIntersecting && isTabVisible && rafId === 0) {
        rafId = requestAnimationFrame(animate)
      }
    }

    const stopLoop = () => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting
        if (isIntersecting) startLoop()
        else stopLoop()
      },
      { threshold: 0 }
    )
    intersectionObserver.observe(container)

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden
      if (isTabVisible) startLoop()
      else stopLoop()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    startLoop()

    return () => {
      stopLoop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      contextMap.delete(container)
      try {
        if (canvas.parentNode === container) {
          container.removeChild(canvas)
        }
      } catch {}
      const loseExt = gl.getExtension('WEBGL_lose_context')
      loseExt?.loseContext()
    }
  }, [])

  // Sync prop changes into uniforms
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ctx = contextMap.get(container)
    if (!ctx) return

    const { program } = ctx
    const u = program.uniforms
    enableMouseRef.current = mouseInteraction

    u.uSpeed.value = speed
    u.uAmplitude.value = amplitude
    u.uWaveScale.value = waveScale
    u.uWaveRatio.value = waveRatio
    u.uSwell.value = swell
    u.uTurbulence.value = turbulence
    u.uTilt.value = tilt
    u.uZoom.value = zoom
    u.uHeight.value = height
    u.uFogDepth.value = fogDepth
    u.uSteps.value = getSteps(detail)
    u.uBrightness.value = brightness
    u.uOpacity.value = opacity
    u.uGrain.value = grain ? 1 : 0
    u.uGrainIntensity.value = grainIntensity
    u.uParallax.value = parallaxStrength
    u.uEnableMouse.value = mouseInteraction

    const hRgb = hexToRgbArr(horizonColor)
    const wRgb = hexToRgbArr(waveColor)
    const cRgb = hexToRgbArr(crestColor)

    const uH = u.uHorizonColor.value as Float32Array
    uH[0] = hRgb[0]; uH[1] = hRgb[1]; uH[2] = hRgb[2]

    const uW = u.uWaveColor.value as Float32Array
    uW[0] = wRgb[0]; uW[1] = wRgb[1]; uW[2] = wRgb[2]

    const uC = u.uCrestColor.value as Float32Array
    uC[0] = cRgb[0]; uC[1] = cRgb[1]; uC[2] = cRgb[2]
  }, [
    horizonColor,
    waveColor,
    crestColor,
    speed,
    amplitude,
    waveScale,
    waveRatio,
    swell,
    turbulence,
    tilt,
    zoom,
    height,
    fogDepth,
    detail,
    brightness,
    opacity,
    mouseInteraction,
    parallaxStrength,
    grain,
    grainIntensity,
  ])

  return (
    <div
      ref={containerRef}
      className={`gradient-waves-container ${className}`.trim()}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', ...style }}
    />
  )
}
