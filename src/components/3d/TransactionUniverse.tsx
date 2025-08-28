import React, { Suspense, useRef, useState, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sphere, Html, TransformControls } from '@react-three/drei'
// Bloom temporarily disabled due to r3f version mismatch; re-enable when upgrading to r3f v9
// import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { motion } from 'framer-motion'
import * as THREE from 'three'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { useTheme } from '../../theme/ThemeProvider'
import { Globe, Zap, DollarSign, TrendingUp, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { VoiceCommandInterface } from '../voice/VoiceCommandInterface'

// Perfect scale financial data for spectacular 3D visualization
const financialNodes = [
  { id: 'revenue', position: [0, 3, 0], size: 2.5, color: '#10b981', label: 'Revenue', value: 125840, type: 'income' },
  { id: 'expenses', position: [-4, 0, 3], size: 2.2, color: '#ef4444', label: 'Expenses', value: 89340, type: 'expense' },
  { id: 'profit', position: [4, 0, -3], size: 1.8, color: '#f59e0b', label: 'Profit', value: 36500, type: 'profit' },
  { id: 'cashflow', position: [0, -3, 0], size: 1.6, color: '#3b82f6', label: 'Cash Flow', value: 45200, type: 'flow' },
  { id: 'assets', position: [-3, 1.5, -1.5], size: 2.0, color: '#8b5cf6', label: 'Assets', value: 234500, type: 'asset' },
  { id: 'liabilities', position: [3, -1.5, 1.5], size: 1.4, color: '#ec4899', label: 'Liabilities', value: 45600, type: 'liability' },
  { id: 'equity', position: [5, 2.0, -1.5], size: 1.5, color: '#22d3ee', label: 'Equity', value: 188900, type: 'equity' },
]

type ConnectionType = 'flow' | 'equation'

const connections: Array<{
  from: string
  to: string
  strength?: number
  type?: ConnectionType
}> = [
  // Operational flows
  { from: 'revenue', to: 'profit', strength: 0.8, type: 'flow' },
  { from: 'expenses', to: 'profit', strength: -0.5, type: 'flow' },
  { from: 'profit', to: 'cashflow', strength: 0.9, type: 'flow' },
  { from: 'cashflow', to: 'assets', strength: 0.5, type: 'flow' },
  // Accounting equation: Assets = Liabilities + Equity (visual only)
  { from: 'liabilities', to: 'assets', type: 'equation' },
  { from: 'equity', to: 'assets', type: 'equation' }
]

// Glow sprite factory (soft radial halo)
function createGlowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const r = size / 2
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r)
  gradient.addColorStop(0, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const glowTexture = createGlowTexture()

// Floating Financial Node Component
function FinancialNode({ 
  position, 
  size, 
  color, 
  label, 
  value, 
  type: _nodeType, 
  isSelected, 
  onSelect,
  nodeId,
  onHoverChange,
  dimmed,
  editLayout = false,
  onDragEnd,
  tooltip,
  highContrast
}: {
  position: [number, number, number]
  size: number
  color: string
  label: string
  value: number
  type: string
  isSelected: boolean
  onSelect: () => void
  nodeId: string
  onHoverChange?: (nodeId: string, hovering: boolean) => void
  dimmed?: boolean
  editLayout?: boolean
  onDragEnd?: (nodeId: string, position: THREE.Vector3) => void
  tooltip?: { percent: number; degree: number }
  highContrast?: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.Sprite>(null)
  const [hovered, setHovered] = useState(false)
  const patternMatRef = useRef<THREE.ShaderMaterial>(null)
  
  useFrame((state) => {
    if (meshRef.current) {
      // Breathing animation
      meshRef.current.scale.setScalar(
        size + Math.sin(state.clock.elapsedTime * 2) * 0.1 + (hovered ? 0.2 : 0)
      )
      
      // Gentle rotation
      meshRef.current.rotation.y += 0.01
      meshRef.current.rotation.x += 0.005
    }
    if (patternMatRef.current) {
      // @ts-ignore
      patternMatRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  const NodeGroup = (
    <group ref={groupRef} position={position}>
      {/* Liquid Glass Main Sphere */}
      <Sphere
        ref={meshRef}
        args={[1, 64, 64]}
        onClick={onSelect}
        onPointerOver={() => { setHovered(true); onHoverChange?.(nodeId, true) }}
        onPointerOut={() => { setHovered(false); onHoverChange?.(nodeId, false) }}
      >
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={dimmed ? 0.6 : 0.85}
          roughness={0.2}
          metalness={0.05}
          clearcoat={0.7}
          clearcoatRoughness={0.25}
          transmission={0.35}
          ior={1.25}
          thickness={0.6}
          emissive={color}
          emissiveIntensity={dimmed ? 0.08 : (isSelected ? 0.35 : hovered ? 0.25 : 0.15)}
        />
      </Sphere>

      {/* Enhanced Multi-Layer Glow */}
      <Sphere args={[1.3, 32, 32]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.25 : 0.15}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Outer Aura */}
      <Sphere args={[1.6, 16, 16]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Soft halo sprite */}
      <sprite ref={glowRef} scale={[size * 1.8, size * 1.8, 1]}>
        {/* @ts-ignore */}
        <spriteMaterial map={glowTexture} opacity={dimmed ? 0.08 : (isSelected ? 0.24 : hovered ? 0.2 : 0.14)} depthWrite={false} depthTest={false} transparent={true} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* Procedural pattern overlay for premium engraved look */}
      <mesh scale={[1.01,1.01,1.01]}>
        <sphereGeometry args={[1, 128, 128]} />
        {/* @ts-ignore */}
        <shaderMaterial
          ref={patternMatRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) }
          }}
          vertexShader={`
            varying vec3 vNormal;
            varying vec3 vPos;
            varying vec3 vView;
            void main(){
              vNormal = normalize(normalMatrix * normal);
              vPos = position;
              vec4 mv = modelViewMatrix * vec4(position,1.0);
              vView = -mv.xyz;
              gl_Position = projectionMatrix * mv;
            }
          `}
          fragmentShader={`
            varying vec3 vNormal;
            varying vec3 vPos;
            uniform float uTime;
            uniform vec3 uColor;
            varying vec3 vView;
            
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
            float noise(vec2 p){
              vec2 i=floor(p), f=fract(p);
              float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
              vec2 u=f*f*(3.-2.*f);
              return mix(a,b,u.x)+ (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
            }
            
            void main(){
              // Spherical UV from normal
              vec3 n = normalize(vNormal);
              float u = atan(n.z, n.x) / (2.0*3.14159265) + 0.5;
              float v = asin(n.y) / 3.14159265 + 0.5;

              // Curving neon grooves using layered noise + sin stripes
              float stripes = smoothstep(0.01, 0.0, abs(sin((u*6.0 + v*4.0) * 3.14159 + uTime*0.3))*0.08);
              float flow = noise(vec2(u*5.0 + uTime*0.05, v*5.0)) * 0.6;
              float pattern = clamp(stripes + flow*0.6, 0.0, 1.0);
              
              vec3 neon = mix(vec3(0.1,0.3,0.6), vec3(1.0,0.3,0.9), 0.5);
              vec3 col = mix(uColor, neon, 0.6) * pattern;
              float alpha = pattern * 0.25;

              // Fresnel rim light
              vec3 V = normalize(vView);
              float rim = pow(1.0 - max(dot(n, V), 0.0), 2.0);
              col += vec3(0.4, 0.7, 1.0) * rim * 0.25;
              gl_FragColor = vec4(col, alpha);
            }
          `}
        />
      </mesh>

      {/* In-node labels as DOM overlay for guaranteed legibility */}
      {(() => {
        const labelPx = Math.round(12 + size * 5)
        const valuePx = Math.round(10 + size * 4)
        return (
          <Html
            center
            sprite
            zIndexRange={[100, 0]}
            distanceFactor={8}
            pointerEvents="none"
            style={{ textAlign: 'center', whiteSpace: 'nowrap', userSelect: 'none' }}
          >
            <div style={{
              transform: 'translateY(-2px)',
              color: 'white',
              fontWeight: highContrast ? 900 as any : 700,
              fontSize: `${labelPx}px`,
              WebkitTextStroke: highContrast ? '0.75px rgba(0,0,0,0.85)' : undefined,
              textShadow: highContrast ? '0 0 0 transparent' : '0 1px 2px rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.5)'
            }}>{label}</div>
            <div style={{
              color: '#dbeafe',
              fontWeight: highContrast ? 800 as any : 600,
              fontSize: `${valuePx}px`,
              marginTop: '2px',
              WebkitTextStroke: highContrast ? '0.6px rgba(0,0,0,0.85)' : undefined,
              textShadow: highContrast ? '0 0 0 transparent' : '0 1px 2px rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.5)'
            }}>{`$${value.toLocaleString()}`}</div>
            {hovered && tooltip && (
              <div style={{
                marginTop: '2px',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.35)',
                color: 'white',
                fontSize: '11px',
                display: 'inline-block',
                backdropFilter: 'blur(2px)'
              }}> {tooltip.percent.toFixed(1)}% • links: {tooltip.degree} </div>
            )}
          </Html>
        )
      })()}

      {/* Enhanced orbiting particles with liquid glass */}
      {Array.from({ length: 4 }).map((_, i) => (
        <OrbitingParticle
          key={i}
          radius={2.0 + i * 0.4}
          speed={0.3 + i * 0.15}
          color={color}
          delay={i * 1.0}
        />
      ))}
    </group>
  )

  if (editLayout) {
    return (
      // @ts-ignore
      <TransformControls mode="translate" showX={false} showZ={false} onMouseUp={() => groupRef.current && onDragEnd?.(nodeId, groupRef.current.position)}>
        {NodeGroup}
      </TransformControls>
    )
  }
  return NodeGroup
}

// Orbiting Particle Component
function OrbitingParticle({ 
  radius, 
  speed, 
  color, 
  delay 
}: {
  radius: number
  speed: number
  color: string
  delay: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  
  useFrame((state) => {
    if (ref.current) {
      const time = state.clock.elapsedTime * speed + delay
      ref.current.position.x = Math.cos(time) * radius
      ref.current.position.z = Math.sin(time) * radius
      ref.current.position.y = Math.sin(time * 2) * 0.2
    }
  })

  return (
    <Sphere ref={ref} args={[0.08, 12, 12]}>
      <meshStandardMaterial 
        color={color} 
        transparent 
        opacity={0.8}
        roughness={0.0}
        metalness={0.5}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </Sphere>
  )
}

// Enhanced Connection Tube Component (WebGL Compatible)
function ConnectionLine({ 
  from, 
  to, 
  strength,
  type = 'flow',
  highlight = false,
  highContrast = false
}: {
  from: [number, number, number]
  to: [number, number, number]
  strength?: number
  type?: 'flow' | 'equation'
  highlight?: boolean
  highContrast?: boolean
}) {
  const ref = useRef<THREE.Mesh>(null)
  
  // Create enhanced tube geometry for liquid glass effect (no pulsing)
  const points = [new THREE.Vector3(...from), new THREE.Vector3(...to)]
  const curve = new THREE.CatmullRomCurve3(points)
  const baseEq = highContrast ? 0.05 : 0.035
  const radius = type === 'equation'
    ? (highlight ? baseEq * 1.6 : baseEq)
    : (Math.abs(strength || 0.5) * 0.04 + 0.02) * (highContrast ? 1.2 : 1)
  const tubeGeometry = new THREE.TubeGeometry(curve, 40, radius, 12, false)
  
  if (type === 'equation') {
    // Render dashed by building multiple short tube segments
    const segments: JSX.Element[] = []
    const count = 12
    const dashRatio = 0.55
    for (let i = 0; i < count; i++) {
      if (i % 2 === 1) continue // gaps
      const t0 = i / count
      const t1 = t0 + (1 / count) * dashRatio
      const pts: THREE.Vector3[] = []
      const steps = 5
      for (let s = 0; s <= steps; s++) {
        const t = THREE.MathUtils.lerp(t0, t1, s / steps)
        pts.push(curve.getPoint(t))
      }
      const sub = new THREE.CatmullRomCurve3(pts)
      const geom = new THREE.TubeGeometry(sub, 10, radius, 12, false)
      segments.push(
        <mesh key={`eq-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={'#a3b2c7'}
            transparent
            opacity={highlight ? 0.65 : 0.5}
            roughness={0.6}
            metalness={0.1}
            emissive={'#94a3b8'}
            emissiveIntensity={highlight ? 0.14 : 0.08}
          />
        </mesh>
      )
    }
    return <group>{segments}</group>
  }
  return (
    <mesh ref={ref} geometry={tubeGeometry}>
      <meshPhysicalMaterial
        color={(strength || 0) > 0 ? '#34d399' : '#f87171'}
        transparent
        opacity={0.6}
        roughness={0.1}
        metalness={0.2}
        clearcoat={0.6}
        clearcoatRoughness={0.3}
        emissive={(strength || 0) > 0 ? '#10b981' : '#ef4444'}
        emissiveIntensity={0.15}
      />
    </mesh>
  )
}

// Flow endpoint disc (direction cue)
function FlowEndpoint({ from, to, positive = true }: { from: [number, number, number]; to: [number, number, number]; positive?: boolean }) {
  const pFrom = new THREE.Vector3(...from)
  const pTo = new THREE.Vector3(...to)
  const pos = new THREE.Vector3().lerpVectors(pFrom, pTo, 0.9)
  const color = positive ? '#10b981' : '#ef4444'
  return (
    <sprite position={pos} scale={[0.5, 0.5, 1]}>
      {/* @ts-ignore */}
      <spriteMaterial map={glowTexture} color={color} opacity={0.8} depthWrite={false} depthTest={false} transparent blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

// Camera helper: smooth center + reset functionality
function SmartCamera({ target, resetSignal }: { target: [number, number, number]; resetSignal: number }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<any>(null)
  const defaultPosition: [number, number, number] = [11, 7, 11]
  const defaultTarget = useRef(new THREE.Vector3(...target))
  const initialized = useRef(false)
  const idleTimer = useRef<number | null>(null)

  const setToDefault = (duration = 650) => {
    let frameId = 0
    const startPos = camera.position.clone()
    const endPos = new THREE.Vector3(...defaultPosition)
    const startTarget = controlsRef.current ? controlsRef.current.target.clone() : camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1)
    const endTarget = defaultTarget.current.clone()
    const startTime = performance.now()
    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / duration)
      camera.position.lerpVectors(startPos, endPos, t)
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(startTarget, endTarget, t)
        controlsRef.current.update()
      } else {
        camera.lookAt(endTarget)
      }
      if (t < 1) frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }

  // Initial setup only once
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    camera.position.set(...defaultPosition)
    camera.lookAt(defaultTarget.current)
    if (controlsRef.current) controlsRef.current.update()
  }, [camera])

  // Reset by explicit signal only
  useEffect(() => setToDefault(), [resetSignal])

  // Idle timeout: recenters after inactivity
  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => setToDefault(900), 12000) as unknown as number
    }
    // User input events on WebGL canvas
    // const el = gl.domElement // not used directly; keep for future pointer binding
    const events = ['pointerdown', 'wheel', 'keydown', 'pointermove']
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }))
    resetIdle()
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
      events.forEach((ev) => window.removeEventListener(ev, resetIdle))
    }
  }, [gl])

  return (
    // @ts-ignore
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={6}
      maxDistance={30}
      enableDamping={true}
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
    />
  )
}

// Universe Environment
function UniverseEnvironment() {
  const { scene } = useThree()
  const starsRef = useRef<THREE.Points | null>(null)
  const starsMatRef = useRef<THREE.PointsMaterial | null>(null)
  const starsGeoRef = useRef<THREE.BufferGeometry | null>(null)
  const fpsAvg = useRef(60)
  
  useEffect(() => {
    // Enhanced lighting for liquid glass effects
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    scene.add(ambientLight)
    
    // Directional light for glass reflections
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight.position.set(20, 20, 20)
    directionalLight.castShadow = true
    scene.add(directionalLight)
    
    // Multiple point lights for spectacular glass effects
    const light1 = new THREE.PointLight(0x3b82f6, 2, 150)
    light1.position.set(15, 15, 15)
    scene.add(light1)
    
    const light2 = new THREE.PointLight(0x10b981, 1.8, 150)
    light2.position.set(-15, -15, -15)
    scene.add(light2)
    
    const light3 = new THREE.PointLight(0x8b5cf6, 1.5, 100)
    light3.position.set(0, 20, 0)
    scene.add(light3)
    
    const light4 = new THREE.PointLight(0xf59e0b, 1.2, 100)
    light4.position.set(0, -20, 0)
    scene.add(light4)
    
    // Optimized star field with circular sprites (no more squares)
    const starsGeometry = new THREE.BufferGeometry()
    const starsCount = 420
    const positions = new Float32Array(starsCount * 3)
    for (let i = 0; i < starsCount * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 160
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    starsGeoRef.current = starsGeometry

    const createStarTexture = () => {
      const size = 64
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const r = size / 2
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.6)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(r, r, r, 0, Math.PI * 2)
      ctx.fill()
      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      return texture
    }

    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      map: createStarTexture(),
      transparent: true,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
    starsMatRef.current = starsMaterial
    const stars = new THREE.Points(starsGeometry, starsMaterial)
    starsRef.current = stars
    scene.add(stars)
    
    return () => {
      scene.remove(ambientLight)
      scene.remove(directionalLight)
      scene.remove(light1)
      scene.remove(light2)
      scene.remove(light3)
      scene.remove(light4)
      scene.remove(stars)
    }
  }, [scene])

  // Subtle star twinkle + parallax rotation
  useFrame((state, delta) => {
    if (starsRef.current && starsMatRef.current) {
      starsRef.current.rotation.y += delta * 0.005
      const t = state.clock.elapsedTime
      starsMatRef.current.opacity = 0.55 + 0.08 * Math.sin(t * 0.5)
    }
    // Adaptive LOD by drawRange based on FPS
    if (starsGeoRef.current) {
      const fps = 1 / delta
      fpsAvg.current = fpsAvg.current * 0.9 + fps * 0.1
      const geo = starsGeoRef.current
      const full = geo.getAttribute('position').count
      let draw = full
      if (fpsAvg.current < 45) draw = Math.floor(full * 0.7)
      if (fpsAvg.current < 35) draw = Math.floor(full * 0.5)
      if (fpsAvg.current < 28) draw = Math.floor(full * 0.35)
      geo.setDrawRange(0, draw)
    }
  })
  
  return null
}

// Atmospheric back sphere for cinematic glow
function Atmosphere() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  return (
    <mesh scale={[160, 160, 160]}>
      <sphereGeometry args={[1, 64, 64]} />
      {/* @ts-ignore */}
      <shaderMaterial
        ref={materialRef}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        vertexShader={`
          varying vec3 vPos;
          void main(){
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `}
        fragmentShader={`
          varying vec3 vPos;
          void main(){
            float d = length(vPos)/160.0; // 0..1
            float glow = smoothstep(1.0, 0.2, d);
            vec3 col = mix(vec3(0.0,0.5,0.8), vec3(0.02,0.1,0.2), d);
            gl_FragColor = vec4(col, glow*0.18);
          }
        `}
      />
    </mesh>
  )
}

// Main Transaction Universe Component
export function TransactionUniverse() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  // const [cameraPosition, setCameraPosition] = useState<[number, number, number] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [resetSignal, setResetSignal] = useState(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [showFlow, setShowFlow] = useState<boolean>(() => {
    const v = localStorage.getItem('universe_showFlow');
    return v ? v === '1' : true
  })
  const [showEquation, setShowEquation] = useState<boolean>(() => {
    const v = localStorage.getItem('universe_showEquation');
    return v ? v === '1' : true
  })
  const [editLayout, setEditLayout] = useState<boolean>(() => localStorage.getItem('universe_editLayout') === '1')
  const [pinned, setPinned] = useState<Record<string, [number, number, number]>>(() => {
    try { const s = localStorage.getItem('universe_nodePins'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const [highContrast, setHighContrast] = useState<boolean>(() => localStorage.getItem('universe_highContrast') === '1')
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [loadMenuOpen, setLoadMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState<boolean>(() => localStorage.getItem('universe_helpOpen') === '1')
  const { currentTheme } = useTheme()
  const [voiceOpen, setVoiceOpen] = useState(false)

  useEffect(() => {
    // Reduce loading time for better UX - just enough for Three.js to initialize
    const timer = setTimeout(() => setIsLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  // Focus/selection from global events
  useEffect(() => {
    const onFocus = (e: any) => {
      try {
        const id = String(e?.detail?.nodeId || '')
        if (!id) return
        setSelectedNode(id)
        // Optional: future camera centering can be added here
      } catch {}
    }
    try { window.addEventListener('universe:focus', onFocus as any) } catch {}
    return () => { try { window.removeEventListener('universe:focus', onFocus as any) } catch {} }
  }, [])

  // Persist help popover state
  useEffect(() => {
    localStorage.setItem('universe_helpOpen', helpOpen ? '1' : '0')
  }, [helpOpen])

  // Autosave pinned positions when edit mode is turned off
  useEffect(() => {
    if (!editLayout) {
      localStorage.setItem('universe_nodePins', JSON.stringify(pinned))
    }
  }, [editLayout])

  const handleNodeDragEnd = (nodeId: string, pos: THREE.Vector3) => {
    // Clamp Y to avoid extreme placements
    const clampedY = Math.max(-5, Math.min(5, pos.y))
    const next = { ...pinned, [nodeId]: [pos.x, clampedY, pos.z] as [number, number, number] }
    setPinned(next)
    localStorage.setItem('universe_nodePins', JSON.stringify(next))
  }

  // Presets: save/load named pin sets
  type Presets = Record<string, Record<string, [number, number, number]>>
  const readPresets = (): Presets => {
    try { const s = localStorage.getItem('universe_presets'); return s ? JSON.parse(s) : {} } catch { return {} }
  }
  const writePresets = (p: Presets) => localStorage.setItem('universe_presets', JSON.stringify(p))
  const savePreset = (name: string) => {
    const presets = readPresets()
    const pins = Object.keys(pinned).length ? pinned : Object.fromEntries(baseLayout.map(n => [n.id, n.position]))
    presets[name] = pins
    writePresets(presets)
    setSaveMenuOpen(false)
  }
  const loadPreset = (name: string) => {
    const presets = readPresets()
    if (!presets[name]) return
    // Clamp and apply
    const pins: Record<string, [number, number, number]> = {}
    Object.entries(presets[name]).forEach(([id, v]: any) => {
      pins[id] = [v[0], Math.max(-5, Math.min(5, v[1])), v[2]]
    })
    setPinned(pins)
    localStorage.setItem('universe_nodePins', JSON.stringify(pins))
    setLoadMenuOpen(false)
  }

  // Spread layout + respect pinned positions
  const SPREAD_RADIUS = 7
  const baseLayout = financialNodes.map((node, i) => {
    const angle = (i / financialNodes.length) * Math.PI * 2 + Math.PI / 6
    const yOffset = i % 2 === 0 ? 1.2 : -1.0
    const r = SPREAD_RADIUS + node.size * 0.3
    return {
      ...node,
      position: [Math.cos(angle) * r, yOffset, Math.sin(angle) * r] as [number, number, number]
    }
  })
  const layoutedNodes = useMemo(() => baseLayout.map(n => ({
    ...n,
    position: pinned[n.id] ?? n.position
  })), [JSON.stringify(pinned)])

  const selectedNodeData = layoutedNodes.find(node => node.id === selectedNode)

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <ThemedGlassSurface variant="medium" className="p-6 text-center w-full">
          <div className="h-64 w-full relative">
            <Canvas className="absolute inset-0" dpr={[1,2]}>
              <ambientLight intensity={0.4} />
              <pointLight position={[4,4,4]} intensity={1.2} />
              <Atmosphere />
              <UniverseEnvironment />
            </Canvas>
          </div>
          <div className="text-sm text-muted-contrast mt-2">Loading 3D financial space…</div>
        </ThemedGlassSurface>
      </div>
    )
  }

  return (
    <div className="h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className={cn(
              "text-2xl font-bold",
              // Theme-aware title colors
              currentTheme === 'light' 
                ? "text-gray-900 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent"
                : currentTheme === 'blue'
                ? "text-white bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
                : currentTheme === 'green'
                ? "text-white bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent"
                : "text-white bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent"
            )}>
              Financial Universe
            </h1>
            <p className="text-sm text-muted-contrast">
              Interactive 3D exploration of your financial ecosystem
            </p>
          </div>
        </div>

        {/* Controls (replaced by in-viewport overlay) */}
        <div className="hidden">
          <button
            onClick={() => setResetSignal(v => v + 1)}
            className="px-3 py-1.5 text-sm bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
          >
            Reset View
          </button>
          <button
            onClick={() => setSelectedNode(null)}
            className="px-3 py-1.5 text-sm bg-surface/50 text-foreground rounded-md hover:bg-surface transition-colors"
          >
            Clear Selection
          </button>
          <button
            onClick={() => setShowSidebar(v => !v)}
            className="px-3 py-1.5 text-sm bg-surface/50 text-foreground rounded-md hover:bg-surface transition-colors"
            title={showSidebar ? 'Enter Cinematic Mode' : 'Exit Cinematic Mode'}
          >
            {showSidebar ? 'Cinematic Mode' : 'Exit Cinematic'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 lg:auto-rows-fr gap-6 lg:h-[700px]">
        {/* 3D Universe Viewport */}
        <div className={`${showSidebar ? 'lg:col-span-3' : 'lg:col-span-4'} h-[420px] sm:h-[520px] lg:h-full min-h-0 flex flex-col`}>
          <ThemedGlassSurface variant="medium" className="h-full min-h-0 p-2 flex flex-col">
            <Suspense fallback={
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                  <div className="text-sm text-muted-contrast">Loading 3D Scene...</div>
                </div>
              </div>
            }>
              <div className="relative flex-1 min-h-0 w-full">
                <Canvas
                  className="absolute inset-0"
                  camera={{ fov: 60 }}
                  style={{ 
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' 
                  }}
                  dpr={[1, 2]} // Adaptive pixel ratio for performance
                  performance={{ min: 0.5 }} // Maintain 30fps minimum
                  gl={{ 
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance"
                  }}
                >
                <UniverseEnvironment />
                <Atmosphere />
                <SmartCamera target={[0, 0, 0]} resetSignal={resetSignal} />
                {/* Post effects can be added here when upgrading r3f to v9+ */}
                
                {/* Financial Nodes with hover-dimmer and optional edit-drag */}
                {layoutedNodes.map((node) => {
                  const degree = connections.filter(c => c.from === node.id || c.to === node.id).length
                  const totalValue = financialNodes.reduce((s, n) => s + n.value, 0)
                  const percent = (node.value / totalValue) * 100
                  return (
                  <FinancialNode
                    key={node.id}
                    position={node.position as [number, number, number]}
                    size={node.size}
                    color={node.color}
                    label={node.label}
                    value={node.value}
                    type={node.type}
                    isSelected={selectedNode === node.id}
                    onSelect={() => setSelectedNode(node.id)}
                    nodeId={node.id}
                    onHoverChange={(id, hovering) => setHoveredNode(hovering ? id : null)}
                    dimmed={hoveredNode !== null && hoveredNode !== node.id}
                    tooltip={{ percent, degree }}
                    editLayout={editLayout}
                    onDragEnd={handleNodeDragEnd}
                    // pass high contrast to tweak labels
                    // @ts-ignore
                    highContrast={highContrast}
                  />
                  )
                })}

                {/* Connection Lines */}
                {connections
                  .filter(c => (c.type === 'equation' ? showEquation : showFlow))
                  .map((connection, index) => {
                  const fromNode = layoutedNodes.find(n => n.id === connection.from)
                  const toNode = layoutedNodes.find(n => n.id === connection.to)
                  
                  if (!fromNode || !toNode) return null
                  
                  return (
                    <React.Fragment key={index}>
                      <ConnectionLine
                        from={fromNode.position as [number, number, number]}
                        to={toNode.position as [number, number, number]}
                        strength={connection.strength}
                        type={connection.type}
                        highlight={connection.type === 'equation' && (hoveredNode === 'assets' || hoveredNode === 'liabilities' || hoveredNode === 'equity')}
                        highContrast={highContrast}
                      />
                      {connection.type === 'flow' && (
                        <FlowEndpoint
                          from={fromNode.position as [number, number, number]}
                          to={toNode.position as [number, number, number]}
                          positive={(connection.strength || 0) >= 0}
                        />
                      )}
                    </React.Fragment>
                  )
                })}

                {/* OrbitControls handled by SmartCamera */}
                </Canvas>

                {/* Overlays */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Soft vignette */}
                  <div className="absolute inset-0 rounded-xl" style={{
                    background: 'radial-gradient(100% 70% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18) 100%)'
                  }} />
                  {/* Horizon glow at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-24" style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.35), rgba(0,0,0,0))'
                  }} />
                </div>

                {/* Top-right controls overlay - always inside viewport to avoid header overlap */}
                <div className="absolute top-2 right-2 z-30 pointer-events-auto">
                  <ThemedGlassSurface variant="light" className="px-2 py-1 lg:px-3 lg:py-2">
                    <div className="flex items-center gap-2 text-xs lg:text-sm">
                      <button
                        className="px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1"
                        onClick={() => setResetSignal(v => v + 1)}
                        title="Reset View"
                      >
                        <RefreshCw className="w-3 h-3" /> Reset
                      </button>
                      <button
                        className="px-2 py-1 rounded bg-surface/60 hover:bg-surface transition-colors flex items-center gap-1"
                        onClick={() => setSelectedNode(null)}
                        title="Clear Selection"
                      >
                        Clear
                      </button>
                      <button
                        className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${showFlow ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-surface/60 hover:bg-surface'}`}
                        onClick={() => { const nv = !showFlow; setShowFlow(nv); localStorage.setItem('universe_showFlow', nv ? '1' : '0') }}
                        title="Toggle Flow Links"
                      >
                        Flow
                      </button>
                      <button
                        className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${showEquation ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-surface/60 hover:bg-surface'}`}
                        onClick={() => { const nv = !showEquation; setShowEquation(nv); localStorage.setItem('universe_showEquation', nv ? '1' : '0') }}
                        title="Toggle Equation Links"
                      >
                        Equation
                      </button>
                      <button
                        className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${editLayout ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-surface/60 hover:bg-surface'}`}
                        onClick={() => { const nv = !editLayout; setEditLayout(nv); localStorage.setItem('universe_editLayout', nv ? '1' : '0') }}
                        title="Toggle Edit Layout"
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 rounded bg-surface/60 hover:bg-surface transition-colors flex items-center gap-1"
                        onClick={() => { localStorage.setItem('universe_nodePins', JSON.stringify(pinned)); }}
                        title="Pin Positions"
                      >
                        Pin
                      </button>
                      <button
                        className="px-2 py-1 rounded bg-surface/60 hover:bg-surface transition-colors flex items-center gap-1"
                        onClick={() => { localStorage.removeItem('universe_nodePins'); setPinned({}); }}
                        title="Reset Layout"
                      >
                        Reset Layout
                      </button>
                      <div className="relative">
                        <button
                          className="px-2 py-1 rounded bg-surface/60 hover:bg-surface transition-colors"
                          onClick={() => { setSaveMenuOpen(v => !v); setLoadMenuOpen(false) }}
                          title="Save Preset"
                        >
                          Save
                        </button>
                        {saveMenuOpen && (
                          <div className="absolute right-0 mt-1 pointer-events-auto">
                            <ThemedGlassSurface variant="light" className="px-2 py-1">
                              <div className="text-xs space-y-1">
                                {['Default','Ops Focus','Balance Focus'].map(n => (
                                  <button key={n} className="block w-full text-left px-2 py-1 rounded hover:bg-surface/80" onClick={() => savePreset(n)}>{n}</button>
                                ))}
                              </div>
                            </ThemedGlassSurface>
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button
                          className="px-2 py-1 rounded bg-surface/60 hover:bg-surface transition-colors"
                          onClick={() => { setLoadMenuOpen(v => !v); setSaveMenuOpen(false) }}
                          title="Load Preset"
                        >
                          Load
                        </button>
                        {loadMenuOpen && (
                          <div className="absolute right-0 mt-1 pointer-events-auto">
                            <ThemedGlassSurface variant="light" className="px-2 py-1">
                              <div className="text-xs space-y-1">
                                {['Default','Ops Focus','Balance Focus'].map(n => (
                                  <button key={n} className="block w-full text-left px-2 py-1 rounded hover:bg-surface/80" onClick={() => loadPreset(n)}>{n}</button>
                                ))}
                              </div>
                            </ThemedGlassSurface>
                          </div>
                        )}
                      </div>
                      <button
                        className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${highContrast ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-surface/60 hover:bg-surface'}`}
                        onClick={() => { const nv = !highContrast; setHighContrast(nv); localStorage.setItem('universe_highContrast', nv ? '1' : '0') }}
                        title="Toggle High Contrast Labels"
                      >
                        Contrast
                      </button>
                      <div className="ml-1">
                        <VoiceCommandInterface isActive={voiceOpen} onToggle={setVoiceOpen} />
                      </div>
                    </div>
                  </ThemedGlassSurface>
                </div>

                {/* Legend + Help */}
                <div className="absolute bottom-2 right-2 z-20 pointer-events-none">
                  <ThemedGlassSurface variant="light" className="px-3 py-2">
                    <div className="text-xs text-foreground/80">
                      <div className="flex items-center gap-2 mb-1"><span className="inline-block w-3 h-1 rounded-full bg-emerald-400"></span> Flow</div>
                      <div className="flex items-center gap-2"><span className="inline-block w-3 h-1 rounded-full bg-slate-400"></span> Equation</div>
                    </div>
                  </ThemedGlassSurface>
                </div>
                <div className="absolute top-16 right-2 z-30 pointer-events-auto" onMouseEnter={() => setHelpOpen(true)} onMouseLeave={() => setHelpOpen(false)}>
                  <ThemedGlassSurface variant="light" className="px-2 py-1">
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        className="flex items-center gap-2"
                        title="Help"
                      >
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">?</span>
                        <span className="text-foreground/80">Help</span>
                      </button>
                    </div>
                    {helpOpen && (
                      <div className="mt-2">
                        <div className="text-xs leading-relaxed max-w-[340px] p-3 rounded-md bg-background/90 text-foreground shadow-md">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block w-3 h-1 rounded-full bg-emerald-400"></span>
                            <span className="text-foreground/80">Flow = operational relationship</span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block w-3 h-1 rounded-full bg-slate-400"></span>
                            <span className="text-foreground/80">Equation = structural balance (Assets = Liabilities + Equity)</span>
                          </div>
                          <ul className="list-disc ml-4 space-y-1 text-foreground/70">
                            <li>Use Flow/Equation toggles to show/hide layers</li>
                            <li>Hover dims unrelated nodes; balance links highlight on A/L/E</li>
                            <li>Reset recenters; idle timeout recenters after a few seconds</li>
                            <li>Edit enables drag (Y-axis only); Pin saves positions; Reset Layout clears pins</li>
                            <li>Save/Load presets to switch layouts (Default, Ops Focus, Balance Focus)</li>
                            <li>Use Contrast for thicker outlines and labels</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </ThemedGlassSurface>
                </div>

                {/* Edit instructions */}
                {editLayout && (
                  <div className="absolute top-16 left-2 z-30 pointer-events-none">
                    <ThemedGlassSurface variant="light" className="px-3 py-2">
                      <div className="text-xs text-foreground/80">Drag nodes vertically to arrange • Click Pin to save • Reset Layout to clear</div>
                    </ThemedGlassSurface>
                  </div>
                )}

                {/* Compact node drawer when sidebar hidden */}
                {!showSidebar && selectedNodeData && (
                  <div className="absolute top-1/2 -translate-y-1/2 right-2 z-30 pointer-events-auto">
                    <ThemedGlassSurface variant="light" className="px-4 py-3 min-w-[220px]">
                      <div className="text-sm font-semibold mb-1">{selectedNodeData.label}</div>
                      <div className="text-xs text-foreground/80 mb-2">${selectedNodeData.value.toLocaleString()}</div>
                      <div className="flex gap-2">
                        <button className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20">View Transactions</button>
                        <button className="px-2 py-1 text-xs rounded bg-surface/60 hover:bg-surface" onClick={() => setSelectedNode(null)}>Close</button>
                      </div>
                    </ThemedGlassSurface>
                  </div>
                )}
              </div>
            </Suspense>
          </ThemedGlassSurface>
        </div>

        {/* Node Details Panel */}
        {showSidebar && (
        <div className="space-y-4 max-h-[50vh] overflow-y-auto lg:max-h-none lg:overflow-visible">
          {selectedNodeData ? (
            <ThemedGlassSurface variant="medium" className="p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: selectedNodeData.color }}
                  />
                  <h3 className="font-semibold">{selectedNodeData.label}</h3>
                </div>

                <div className="space-y-2">
                  <div className="text-2xl font-bold">
                    ${selectedNodeData.value.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-contrast capitalize">
                    Type: {selectedNodeData.type}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Connected To:</h4>
                  {connections
                    .filter(c => c.from === selectedNodeData.id || c.to === selectedNodeData.id)
                    .map((connection, index) => {
                      const connectedId = connection.from === selectedNodeData.id ? connection.to : connection.from
                      const connectedNode = financialNodes.find(n => n.id === connectedId)
                      
                      if (!connectedNode) return null
                      
                      return (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span>{connectedNode.label}</span>
                          <span className={(connection.strength ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}>
                            {Math.abs((connection.strength ?? 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </ThemedGlassSurface>
          ) : (
            <ThemedGlassSurface variant="light" className="p-4 text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 text-muted-contrast" />
              <p className="text-sm text-muted-contrast">
                Click on a node to explore its connections and details
              </p>
            </ThemedGlassSurface>
          )}

          {/* Quick Stats */}
          <ThemedGlassSurface variant="light" className="p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Universe Stats
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Nodes:</span>
                <span>{financialNodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Connections:</span>
                <span>{connections.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Value:</span>
                <span>${financialNodes.reduce((sum, node) => sum + node.value, 0).toLocaleString()}</span>
              </div>
            </div>
          </ThemedGlassSurface>

          {/* Action Buttons */}
          <div className="space-y-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full p-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Add Transaction
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full p-2 bg-surface text-foreground rounded-lg text-sm font-medium hover:bg-surface/80 transition-colors flex items-center justify-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              View Reports
            </motion.button>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
