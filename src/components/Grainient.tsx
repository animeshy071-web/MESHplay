// Grainient — flowing three-color WebGL gradient with domain warp + grain.
// ReactBits-style API; theme colors are lerped on the JS side for smooth recolors.

import { useEffect, useRef } from 'react'
import { hexToRgb, lerpRgb, type Rgb } from '../lib/color'

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uColorBalance;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uRotation;
uniform float uNoiseScale;
uniform vec2 uCenter;
uniform float uZoom;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uGrainAnimated;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03; a *= 0.5; }
  return v;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  uv -= uCenter;
  uv *= uZoom;
  uv = rot(uRotation * 0.0008) * uv;

  float t = uTime;
  vec2 w = vec2(
    fbm(uv * uWarpFrequency + vec2(t * uWarpSpeed * 0.15, 0.0)),
    fbm(uv * uWarpFrequency + vec2(0.0, t * uWarpSpeed * 0.15) + 5.2)
  );
  vec2 p = uv + (w - 0.5) * (uWarpStrength * 0.45)
         + sin(t * 0.25 + uv.yx * uWarpFrequency) * uWarpAmplitude * 0.0012;

  float n = fbm(p * uNoiseScale + uColorBalance * 3.0);
  vec2 dir = rot(uBlendAngle * 3.14159265) * vec2(1.0, 0.0);
  float g = dot(p, dir) / max(uBlendSoftness, 0.05) * 0.02 + (n - 0.5) * 1.7;

  vec3 col = mix(uC1, uC2, smoothstep(-0.55, 0.55, g));
  col = mix(col, uC3, smoothstep(0.2, 0.85, n * n * 1.35));

  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  col = pow(col, vec3(1.0 / max(uGamma, 0.01)));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col *= 0.8;

  float ga = hash(gl_FragCoord.xy / max(uGrainScale, 0.01) + (uGrainAnimated > 0.5 ? fract(t) : 0.0));
  col += (ga - 0.5) * uGrainAmount;

  gl_FragColor = vec4(col, 1.0);
}
`

export interface GrainientProps {
  color1: string
  color2: string
  color3: string
  timeSpeed?: number
  colorBalance?: number
  warpStrength?: number
  warpFrequency?: number
  warpSpeed?: number
  warpAmplitude?: number
  blendAngle?: number
  blendSoftness?: number
  rotationAmount?: number
  noiseScale?: number
  grainAmount?: number
  grainScale?: number
  grainAnimated?: boolean
  contrast?: number
  gamma?: number
  saturation?: number
  centerX?: number
  centerY?: number
  zoom?: number
  scale?: number
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
  return s
}

export default function Grainient({
  color1, color2, color3,
  timeSpeed = 0.25, colorBalance = 0.0,
  warpStrength = 1.0, warpFrequency = 5.0, warpSpeed = 2.0, warpAmplitude = 50.0,
  blendAngle = 0.0, blendSoftness = 0.05,
  rotationAmount = 500.0, noiseScale = 2.0,
  grainAmount = 0.1, grainScale = 2.0, grainAnimated = false,
  contrast = 1.5, gamma = 1.0, saturation = 1.0,
  centerX = 0.0, centerY = 0.0, zoom = 0.9, scale = 0.5,
}: GrainientProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const target = useRef({ c1: hexToRgb(color1), c2: hexToRgb(color2), c3: hexToRgb(color3) })

  useEffect(() => {
    target.current = { c1: hexToRgb(color1), c2: hexToRgb(color2), c3: hexToRgb(color3) }
  }, [color1, color2, color3])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const U = (n: string) => gl.getUniformLocation(prog, n)
    const u = {
      res: U('uRes'), time: U('uTime'),
      c1: U('uC1'), c2: U('uC2'), c3: U('uC3'),
      bal: U('uColorBalance'), ang: U('uBlendAngle'), soft: U('uBlendSoftness'),
      ws: U('uWarpStrength'), wf: U('uWarpFrequency'), wv: U('uWarpSpeed'), wa: U('uWarpAmplitude'),
      rot: U('uRotation'), ns: U('uNoiseScale'), ctr: U('uCenter'), zoom: U('uZoom'),
      ct: U('uContrast'), gm: U('uGamma'), st: U('uSaturation'),
      ga: U('uGrainAmount'), gs: U('uGrainScale'), gr: U('uGrainAnimated'),
    }

    const resize = () => {
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * scale))
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const cur = {
      c1: { ...target.current.c1 }, c2: { ...target.current.c2 }, c3: { ...target.current.c3 },
    }
    const norm = (c: Rgb) => [c.r / 255, c.g / 255, c.b / 255]

    let raf = 0
    let last = performance.now()
    let t = 0
    let running = true
    const onVis = () => {
      running = document.visibilityState === 'visible'
      if (running) { last = performance.now(); raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      t += dt * timeSpeed
      const k = 1 - Math.exp(-dt * 2.5)
      cur.c1 = lerpRgb(cur.c1, target.current.c1, k)
      cur.c2 = lerpRgb(cur.c2, target.current.c2, k)
      cur.c3 = lerpRgb(cur.c3, target.current.c3, k)

      gl.uniform2f(u.res, canvas.width, canvas.height)
      gl.uniform1f(u.time, t)
      gl.uniform3fv(u.c1, norm(cur.c1))
      gl.uniform3fv(u.c2, norm(cur.c2))
      gl.uniform3fv(u.c3, norm(cur.c3))
      gl.uniform1f(u.bal, colorBalance)
      gl.uniform1f(u.ang, blendAngle)
      gl.uniform1f(u.soft, blendSoftness)
      gl.uniform1f(u.ws, warpStrength)
      gl.uniform1f(u.wf, warpFrequency)
      gl.uniform1f(u.wv, warpSpeed)
      gl.uniform1f(u.wa, warpAmplitude)
      gl.uniform1f(u.rot, rotationAmount)
      gl.uniform1f(u.ns, noiseScale)
      gl.uniform2f(u.ctr, centerX, centerY)
      gl.uniform1f(u.zoom, zoom)
      gl.uniform1f(u.ct, contrast)
      gl.uniform1f(u.gm, gamma)
      gl.uniform1f(u.st, saturation)
      gl.uniform1f(u.ga, grainAmount)
      gl.uniform1f(u.gs, grainScale)
      gl.uniform1f(u.gr, grainAnimated ? 1 : 0)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />
}
