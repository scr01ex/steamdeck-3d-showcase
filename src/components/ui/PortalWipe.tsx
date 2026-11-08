'use client'

import React, { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { showcaseState } from '../3d/deckState'
import { SteamLibraryRing } from '../3d/SteamLibraryRing'
import { planetPreloadState } from '../3d/planetPreloadState'
import { LibraryShowcase } from './LibraryShowcase'

/**
 * Camera Choreography for Scene 3 (Steam Library & Planet):
 * - Keeps lookAt centered at (0, 0, 0) while card is unfolding in the center (p < 0.55).
 * - Tracks planet smoothly to x = -0.75 as the card expands to full screen (p: 0.55 -> 1.0).
 */
function Scene3CameraTracker() {
  const { camera } = useThree()
  const lookAtRef = useRef(new THREE.Vector3(0, -0.05, 0))

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__scene3Camera = camera
      window.THREE = THREE
    }
  }, [camera])

  useFrame((state, delta) => {
    const isPortal = showcaseState.portalPhase !== 'idle'
    const p = isPortal ? showcaseState.portalProgress : (showcaseState.activeScene === 3 || showcaseState.activeScene === 4 ? 1.0 : 0.0)

    const persCam = camera as THREE.PerspectiveCamera
    const aspect = persCam.aspect || (state.size.width / state.size.height) || 1.777
    const isStacked = (state.size.width <= 1024) || (aspect <= 1.15)
    const tStacked = isStacked ? 1 : 0

    // Camera lookAt target:
    // Wide desktop: centered on game ring (-0.85).
    // Stacked layout: smartphones (aspect < 0.85) -0.85, tablets/narrow viewports 0.0 (centered).
    const stackedLookX = aspect < 0.85 ? -0.85 : 0.0
    const baseLookX = THREE.MathUtils.lerp(-0.85, stackedLookX, tStacked)
    let targetLookX = 0
    if (isPortal) {
      if (p < 0.45) {
        targetLookX = 0.0
      } else {
        const glideT = (p - 0.45) / 0.55
        const easeGlide = glideT * glideT * (3 - 2 * glideT)
        targetLookX = THREE.MathUtils.lerp(0.0, baseLookX, easeGlide)
      }
    } else if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) {
      targetLookX = baseLookX
    } else {
      targetLookX = 0.0
    }

    const s4 = showcaseState.scene4Progress
    const s5 = showcaseState.scene5Progress
    const p5 = s5

    // Wide desktop (tStacked = 0): base coordinates [0, 2.05, 10.2], lookY: -0.05.
    // Mobile viewports: distance 10.85 frames the scene naturally without edge cutoffs.
    const baseCamY = THREE.MathUtils.lerp(2.05, aspect < 0.85 ? 2.60 : 2.50, tStacked)
    const baseCamZ = THREE.MathUtils.lerp(10.2, aspect < 0.85 ? 10.85 : 11.10, tStacked)
    const camY_s4 = THREE.MathUtils.lerp(baseCamY, 0.0, s4)
    const camZ_s4 = THREE.MathUtils.lerp(baseCamZ, 8.8, s4)
    const baseLookY = THREE.MathUtils.lerp(-0.05, aspect < 0.85 ? 0.60 : 0.65, tStacked)
    const portalLookY = isStacked ? (aspect < 0.85 ? 0.05 : 0.0) : -0.05
    let targetLookY = baseLookY
    if (isPortal) {
      if (p < 0.45) {
        targetLookY = portalLookY
      } else {
        const glideT = (p - 0.45) / 0.55
        const easeGlide = glideT * glideT * (3 - 2 * glideT)
        targetLookY = THREE.MathUtils.lerp(portalLookY, baseLookY, easeGlide)
      }
    } else if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) {
      targetLookY = baseLookY
    } else {
      targetLookY = portalLookY
    }

    const s4LookX = THREE.MathUtils.lerp(targetLookX, 0.0, s4)
    const s4LookY = THREE.MathUtils.lerp(targetLookY, 0.0, s4)
    const isDirectPortal5 = showcaseState.portalPhase !== 'idle' && 
      (showcaseState.portalSourceScene === 5 || showcaseState.portalTargetScene === 5)

    const isPortalExit5To1or2 = showcaseState.portalPhase === 'closing' && 
      showcaseState.portalSourceScene === 5 && 
      (showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2)

    if (isPortalExit5To1or2) {
      // Direct transition 5 -> 1 or 2:
      // Camera holds eye-level height matching portal aperture directly over console
      const exitT = 1.0 - THREE.MathUtils.clamp(p5, 0, 1)
      const targetCamX = 0
      const targetCamY = THREE.MathUtils.lerp(0.38, 0.18, exitT)
      const targetCamZ = THREE.MathUtils.lerp(8.8, 8.4, exitT)
      camera.position.set(targetCamX, targetCamY, targetCamZ)

      const targetLookX = 0
      const targetLookY = THREE.MathUtils.lerp(0.32, 0.12, exitT)
      const targetLookZ = 3.65
      lookAtRef.current.set(targetLookX, targetLookY, targetLookZ)
      camera.lookAt(lookAtRef.current)

      if (persCam.isPerspectiveCamera) {
        persCam.fov = THREE.MathUtils.lerp(45, 48.0, Math.sin(exitT * Math.PI))
        persCam.updateProjectionMatrix()
      }
    } else if (p5 <= 0.00001 && !isDirectPortal5) {
      // Idle state for Scenes 3 and 4
      camera.position.set(0, camY_s4, camZ_s4)
      camera.rotation.z = 0
      lookAtRef.current.x = THREE.MathUtils.damp(lookAtRef.current.x, s4LookX, isPortal ? 10.0 : 6.0, delta)
      lookAtRef.current.y = THREE.MathUtils.damp(lookAtRef.current.y, s4LookY, isPortal ? 10.0 : 6.0, delta)
      lookAtRef.current.z = THREE.MathUtils.damp(lookAtRef.current.z, 0, 6.0, delta)
      camera.lookAt(lookAtRef.current)
      if (persCam.isPerspectiveCamera && Math.abs(persCam.fov - 45) > 0.01) {
        persCam.fov = 45
        persCam.updateProjectionMatrix()
      }
    } else {
      // Scene 5 or direct portal transition 1/2 <-> 5:
      // Camera continuously tracks crystal flock in center frame
      const diveEase = THREE.MathUtils.smoothstep(p5, 0.0, 0.88)
      const worldDropH = diveEase * 16.0 + p5 * 2.0

      const blendChase = isDirectPortal5 ? 1.0 : THREE.MathUtils.smoothstep(p5, 0.0, 0.18)
      const targetCamX = 0
      const targetCamY = isDirectPortal5 ? -worldDropH + 0.15 : THREE.MathUtils.lerp(camY_s4, -worldDropH + 0.15, blendChase)
      const targetCamZ = isDirectPortal5 ? 8.2 : THREE.MathUtils.lerp(camZ_s4, 8.2, blendChase)

      camera.position.set(targetCamX, targetCamY, targetCamZ)

      // Camera lookAt continuously tracks center of flock:
      const targetLookX = isDirectPortal5 ? 0 : THREE.MathUtils.lerp(s4LookX, 0.0, blendChase)
      const targetLookYOffset = 1.25 // Standard look angle (1.25) for crystal group centering
      const targetLookY = isDirectPortal5 ? -worldDropH + targetLookYOffset : THREE.MathUtils.lerp(s4LookY, -worldDropH + targetLookYOffset, blendChase)
      const targetLookZ = isDirectPortal5 ? 4.0 : THREE.MathUtils.lerp(0.0, 4.0, blendChase)

      lookAtRef.current.set(targetLookX, targetLookY, targetLookZ)
      camera.lookAt(lookAtRef.current)

      // Dynamic FOV widening during flock acceleration
      if (persCam.isPerspectiveCamera) {
        persCam.fov = THREE.MathUtils.lerp(45, 50.0, Math.sin(p5 * Math.PI))
        persCam.updateProjectionMatrix()
      }
    }
  })

  return null
}

function StudioLighting() {
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const ambRef = useRef<THREE.AmbientLight>(null)
  const dirRefs = useRef<(THREE.DirectionalLight | null)[]>([])

  useFrame(() => {
    const s5 = showcaseState.scene5Progress
    const p5 = s5
    // Lighting dims to 0 towards p5=1.0 into darkroom space:
    const dim = Math.max(0, 1.0 - p5 * p5)

    if (hemiRef.current) hemiRef.current.intensity = 2.1 * dim
    if (ambRef.current) ambRef.current.intensity = 1.55 * dim
    const baseIntensities = [1.75, 1.15, 1.5, 1.45, 1.45, 1.7]
    dirRefs.current.forEach((dir, i) => {
      if (dir) dir.intensity = (baseIntensities[i] || 1.5) * dim
    })
  })

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#ffffff', '#cbd5e1', 2.1]} />
      <ambientLight ref={ambRef} intensity={1.55} />
      <directionalLight ref={(el) => { dirRefs.current[0] = el }} position={[3, 8, 10]} intensity={1.75} />
      <directionalLight ref={(el) => { dirRefs.current[1] = el }} position={[1.5, 2.5, 11]} intensity={1.15} color="#ffffff" />
      <directionalLight ref={(el) => { dirRefs.current[2] = el }} position={[-7, 2, 10]} intensity={1.5} color="#f8fafc" />
      <directionalLight ref={(el) => { dirRefs.current[3] = el }} position={[7, 2, 10]} intensity={1.45} color="#f8fafc" />
      <directionalLight ref={(el) => { dirRefs.current[4] = el }} position={[0, -4, 10]} intensity={1.45} color="#f1f5f9" />
      <directionalLight ref={(el) => { dirRefs.current[5] = el }} position={[0, 7, -5]} intensity={1.7} color="#e2e8f0" />
    </>
  )
}

/**
 * Portal Aperture Wipe Layer for Scene 3 and 5 transitions:
 * Chamfered mecha polygon aperture that expands/contracts symmetrically over the viewport.
 */
export function PortalWipe() {
  const [portalState, setPortalState] = useState<{
    phase: 'idle' | 'opening' | 'closing'
    progress: number
    sourceScene?: 1 | 2 | 3 | 4 | 5
    targetScene?: 1 | 2 | 3 | 4 | 5
  }>({
    phase: showcaseState.portalPhase,
    progress: showcaseState.portalProgress,
    sourceScene: showcaseState.portalSourceScene,
    targetScene: showcaseState.portalTargetScene,
  })

  const [activeScene, setActiveScene] = useState(showcaseState.activeScene)
  const [dims, setDims] = useState({ width: 1440, height: 900 })

  const whiteBgRef = useRef<HTMLDivElement>(null)
  const gridBgRef = useRef<HTMLDivElement>(null)
  const blackBgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateDims = () => {
      setDims({ width: window.innerWidth, height: window.innerHeight })
    }
    updateDims()
    window.addEventListener('resize', updateDims)
    return () => window.removeEventListener('resize', updateDims)
  }, [])

  useEffect(() => {
    const syncBackgrounds = (
      prog: number = showcaseState.scene5Progress,
      activeScn: number = showcaseState.activeScene,
      phase: 'idle' | 'opening' | 'closing' = showcaseState.portalPhase,
      srcScn?: 1 | 2 | 3 | 4 | 5,
      tgtScn?: 1 | 2 | 3 | 4 | 5
    ) => {
      const pPhase = phase ?? showcaseState.portalPhase
      const pSrc = srcScn ?? showcaseState.portalSourceScene
      const pTgt = tgtScn ?? showcaseState.portalTargetScene

      const isDirect5Active = pPhase !== 'idle' && (pSrc === 5 || pTgt === 5)
      const isExitingToLight =
        showcaseState.navTargetScene === 3 ||
        showcaseState.navTargetScene === 4 ||
        (showcaseState.scene5Phase === 'transitioning' && showcaseState.scene5TargetScene !== 5) ||
        activeScn === 3 ||
        activeScn === 4

      // Direct mecha portal active between 1/2 and 5:
      if (isDirect5Active) {
        if (whiteBgRef.current) whiteBgRef.current.style.opacity = '0'
        if (gridBgRef.current) gridBgRef.current.style.opacity = '0'
        if (blackBgRef.current) blackBgRef.current.style.opacity = '1'
        return
      }

      // Full Scene 5 settled active (and not exiting):
      if (activeScn === 5 && !isExitingToLight) {
        if (whiteBgRef.current) whiteBgRef.current.style.opacity = '0'
        if (gridBgRef.current) gridBgRef.current.style.opacity = '0'
        if (blackBgRef.current) blackBgRef.current.style.opacity = '1'
        return
      }

      // Settled in Scene 1, 2, 3, or 4 with minimal scene5 progress, or navigating to 3/4:
      if (prog <= 0.001 || activeScn === 3 || activeScn === 4) {
        if (prog <= 0.001) {
          if (whiteBgRef.current) whiteBgRef.current.style.opacity = '1'
          if (gridBgRef.current) gridBgRef.current.style.opacity = '0.24'
          if (blackBgRef.current) blackBgRef.current.style.opacity = '0'
          return
        }
      }

      // Smooth crossfade during Scene 5 <-> Scene 3/4 transition:
      const p5 = prog * prog * (3 - 2 * prog)
      if (whiteBgRef.current) {
        whiteBgRef.current.style.opacity = Math.max(0, 1 - p5).toFixed(4)
      }
      if (gridBgRef.current) {
        gridBgRef.current.style.opacity = (0.24 * Math.max(0, 1 - p5)).toFixed(4)
      }
      if (blackBgRef.current) {
        blackBgRef.current.style.opacity = p5.toFixed(4)
      }
    }

    // Run immediately on mount
    syncBackgrounds()

    const unsubPortal = showcaseState.onPortalChange((data) => {
      setPortalState(data)
      syncBackgrounds(showcaseState.scene5Progress, showcaseState.activeScene, data.phase, data.sourceScene, data.targetScene)
    })
    const unsubScene = showcaseState.onActiveSceneChange((s) => {
      setActiveScene(s)
      syncBackgrounds(showcaseState.scene5Progress, s, showcaseState.portalPhase, showcaseState.portalSourceScene, showcaseState.portalTargetScene)
    })
    const unsubScene5 = showcaseState.onScene5Change((prog) => {
      syncBackgrounds(prog, showcaseState.activeScene, showcaseState.portalPhase, showcaseState.portalSourceScene, showcaseState.portalTargetScene)
    })
    const unsubNavTarget = showcaseState.onNavTargetChange((_tgt) => {
      syncBackgrounds(showcaseState.scene5Progress, showcaseState.activeScene, showcaseState.portalPhase, showcaseState.portalSourceScene, showcaseState.portalTargetScene)
    })
    return () => {
      unsubPortal()
      unsubScene()
      unsubScene5()
      unsubNavTarget()
    }
  }, [])

  const isDirect5Transition = (
    portalState.phase !== 'idle' && (
      portalState.targetScene === 5 || portalState.sourceScene === 5 ||
      showcaseState.portalTargetScene === 5 || showcaseState.portalSourceScene === 5
    ) && (
      portalState.targetScene === 1 || portalState.targetScene === 2 ||
      portalState.sourceScene === 1 || portalState.sourceScene === 2 ||
      showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2 ||
      showcaseState.portalSourceScene === 1 || showcaseState.portalSourceScene === 2
    )
  )

  const isPortal = portalState.phase !== 'idle' && !isDirect5Transition
  const isExiting5 = 
    showcaseState.navTargetScene === 3 || 
    showcaseState.navTargetScene === 4 ||
    (showcaseState.scene5Phase === 'transitioning' && showcaseState.scene5TargetScene !== 5)

  const isScene5Active = activeScene === 5 && !isExiting5
  const isVisible = (activeScene === 3 || activeScene === 4 || activeScene === 5 || isPortal) && !isDirect5Transition
  const isFullscreenCard = !isPortal && (activeScene === 3 || activeScene === 4 || activeScene === 5)
  const p = isPortal ? portalState.progress : (isFullscreenCard ? 1.0 : 0.0)
  const isS5State = activeScene === 5 || isDirect5Transition
  const initP5 = isS5State ? showcaseState.scene5Progress * showcaseState.scene5Progress * (3 - 2 * showcaseState.scene5Progress) : 0
  const W = dims.width
  const H = dims.height

  // Compute card dimensions and chamfered polygon coordinates (continuous silk-smooth expansion)
  const { cssPolygon, svgPoints, borderOpacity, x1, x2, y1, y2 } = useMemo(() => {
    if (!isVisible) {
      return {
        cssPolygon: 'none',
        svgPoints: '',
        borderOpacity: 0,
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
      }
    }

    if (isFullscreenCard) {
      // Full-screen state for Scenes 3, 4, and 5
      return {
        cssPolygon: 'none',
        svgPoints: '',
        borderOpacity: 0,
        x1: 0,
        x2: W,
        y1: 0,
        y2: H,
      }
    }

    const cx = W / 2
    const cy = H / 2
    const targetCardW = Math.min(W * 0.54, 680)
    // Card height in Phase 1 maintains clearance below header buttons (y1 >= 70px):
    const baseH = Math.min(Math.max(260, H - 140), 760)

    let cardW = 0
    let cardH = baseH
    let chamfer = 0
    let bOp = 0

    if (p <= 0.45) {
      // Phase 1: Aperture expansion from center slot
      const t = p / 0.45
      const easeT = 1 - Math.pow(1 - t, 2.8)
      cardW = easeT * targetCardW
      chamfer = Math.min(52, cardW * 0.45)
      bOp = Math.min(1, t * 3.0)
    } else {
      // Phase 2: Full-screen expansion via smoothstep curve
      const t = (p - 0.45) / 0.55
      const easeBloom = t * t * (3 - 2 * t)
      cardW = targetCardW + easeBloom * (W * 1.8 - targetCardW)
      cardH = baseH + easeBloom * (H * 1.8 - baseH)
      chamfer = Math.max(0, 52 * (1 - easeBloom * 2.2))
      bOp = Math.max(0, 1 - easeBloom * 2.0)
    }

    const _x1 = cx - cardW / 2
    const _x2 = cx + cardW / 2
    const _y1 = cy - cardH / 2
    const _y2 = cy + cardH / 2

    // CSS Polygon format (comma-separated with px)
    const cssPts = [
      `${_x1.toFixed(1)}px ${_y1.toFixed(1)}px`,
      `${(_x2 - chamfer).toFixed(1)}px ${_y1.toFixed(1)}px`,
      `${_x2.toFixed(1)}px ${(_y1 + chamfer).toFixed(1)}px`,
      `${_x2.toFixed(1)}px ${_y2.toFixed(1)}px`,
      `${(_x1 + chamfer).toFixed(1)}px ${_y2.toFixed(1)}px`,
      `${_x1.toFixed(1)}px ${(_y2 - chamfer).toFixed(1)}px`,
    ].join(', ')

    // SVG Points format (space-separated x,y)
    const svgPts = [
      `${_x1.toFixed(1)},${_y1.toFixed(1)}`,
      `${(_x2 - chamfer).toFixed(1)},${_y1.toFixed(1)}`,
      `${_x2.toFixed(1)},${(_y1 + chamfer).toFixed(1)}`,
      `${_x2.toFixed(1)},${_y2.toFixed(1)}`,
      `${(_x1 + chamfer).toFixed(1)},${_y2.toFixed(1)}`,
      `${_x1.toFixed(1)},${(_y2 - chamfer).toFixed(1)}`,
    ].join(' ')

    const poly = `polygon(${cssPts})`
    if (isPortal) {
      showcaseState.portalClipPath = poly
    }

    return {
      cssPolygon: poly,
      svgPoints: svgPts,
      borderOpacity: bOp,
      x1: _x1,
      x2: _x2,
      y1: _y1,
      y2: _y2,
    }
  }, [isVisible, isFullscreenCard, p, W, H])

  useEffect(() => {
    if (isDirect5Transition) return
    const isFull = activeScene === 3 || activeScene === 4 || activeScene === 5
    showcaseState.setPortalClipPath(isPortal ? cssPolygon : (isFull ? 'none' : 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'))
  }, [isPortal, cssPolygon, activeScene, isDirect5Transition])

  return (
    <>
      {/* 1. SCENE 3 & 4 CLIPPED PORTAL CONTAINER:
          - Contains the pure white studio background and the 3D Planet & Library Ring.
          - Kept mounted & pre-warmed in background so shaders and video textures stay hot in GPU memory.
          - Clipped via clipPath to the chamfered card aperture during transitions.
          - Completely transparent outside the card so Scene 2 (Steam Deck in darkroom) is 100% visible!
      */}
      <div
        id="scene3-portal-layer"
        className="fixed inset-0 z-[35] select-none overflow-hidden"
        style={{
          clipPath: isPortal ? cssPolygon : (isFullscreenCard ? 'none' : 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'),
          WebkitClipPath: isPortal ? cssPolygon : (isFullscreenCard ? 'none' : 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'),
          visibility: isVisible ? 'visible' : 'hidden',
          pointerEvents: isFullscreenCard && !isPortal ? 'auto' : 'none',
        }}
      >
        {/* Solid Pure White Studio Base (fades out as Scene 5 darkness fades in) */}
        <div 
          ref={whiteBgRef}
          className="absolute inset-0 bg-[#ffffff] pointer-events-none will-change-opacity" 
          style={{ opacity: isScene5Active ? 0 : Math.max(0, 1 - initP5) }}
        />
        {/* Subtle Engineering Dot Grid with Scene 1 neutral-900 tint and radial vignetting */}
        <div
          ref={gridBgRef}
          className="absolute inset-0 pointer-events-none will-change-opacity"
          style={{
            backgroundImage: 'radial-gradient(#171717 0.95px, transparent 0.95px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0',
            opacity: isScene5Active ? 0 : (0.24 * Math.max(0, 1 - initP5)),
            maskImage: 'radial-gradient(1200px circle at center, black, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(1200px circle at center, black, transparent 80%)',
          }}
        />

        {/* Scene 5: Pure black backdrop #000000 */}
        <div 
          ref={blackBgRef}
          className="absolute inset-0 pointer-events-none bg-black will-change-opacity"
          style={{ opacity: isScene5Active ? 1 : initP5 }}
        />

        {/* 3D Canvas rendering Scene 3, 4 & 5 (Steam Library Ring, Ribbon Unspool & Cinematic Dive) */}
        <div 
          className="absolute inset-0 pointer-events-auto overflow-hidden"
          style={{ width: `${W}px`, height: `${H}px` }}
        >
          <Canvas
            role="img"
            aria-label="Interactive 3D scene of Steam Deck game library"
            resize={{ offsetSize: true, scroll: false, debounce: 0 }}
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            camera={{ position: [0, 2.05, 10.2], fov: 45 }}
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl, scene, camera }) => {
              if (gl.domElement) {
                gl.domElement.setAttribute('role', 'img')
                gl.domElement.setAttribute('aria-label', 'Interactive 3D scene of Steam Deck game library')
              }
              window.__scene3Renderer = gl
              window.__scene3Scene = scene
              window.__scene3Camera = camera
              // Precompile shaders and prepare geometry in VRAM during preload
              try {
                const hiddenNodes: THREE.Object3D[] = []
                scene.traverse((obj) => {
                  if (!obj.visible) {
                    obj.visible = true
                    hiddenNodes.push(obj)
                  }
                })
                gl.compile(scene, camera)
                hiddenNodes.forEach((obj) => {
                  obj.visible = false
                })
                planetPreloadState.markShadersCompiled()
              } catch (_) {}
            }}
          >
            <Suspense fallback={null}>
              <StudioLighting />
              <Scene3CameraTracker />
              <SteamLibraryRing />
            </Suspense>
          </Canvas>
        </div>

        {/* 2D Editorial Specs & Scramble Typography (strictly suppressed during Scene 5 portal) */}
        <LibraryShowcase isVisible={isVisible && !isScene5Active} />
      </div>

      {/* 2. CARD OUTLINE & CORNER CROSSHAIRS (Framing the card aperture on top of Scene 1 or Scene 2) */}
      {borderOpacity > 0.02 && (() => {
        const isScene1Context = 
          portalState.sourceScene === 1 || portalState.targetScene === 1 ||
          showcaseState.portalSourceScene === 1 || showcaseState.portalTargetScene === 1 ||
          activeScene === 1

        const isDarkSource = !isScene1Context

        const strokeColor = isDarkSource ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)'
        const crosshairBg = isDarkSource ? 'bg-white' : 'bg-black'

        return (
          <div className="fixed inset-0 z-40 pointer-events-none select-none overflow-hidden">
            {/* Crisp Polygon Outline Border around the Aperture */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none" 
              width={W} 
              height={H} 
              viewBox={`0 0 ${W} ${H}`}
              style={{
                filter: !isDarkSource ? 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.12))' : undefined,
              }}
            >
              <polygon
                points={svgPoints}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.5"
                opacity={borderOpacity}
              />
            </svg>

            {/* 4-Corner Precision Crosshairs attached to card bounds */}
            <div className="absolute inset-0 pointer-events-none" style={{ opacity: borderOpacity }}>
              {/* Top-Left Crosshair */}
              <div className="absolute w-4 h-4" style={{ left: `${x1 - 8}px`, top: `${y1 - 8}px` }}>
                <div className={`absolute top-[7px] left-0 w-4 h-[2px] ${crosshairBg} shadow-sm`} />
                <div className={`absolute top-0 left-[7px] w-[2px] h-4 ${crosshairBg} shadow-sm`} />
              </div>
              {/* Top-Right Crosshair */}
              <div className="absolute w-4 h-4" style={{ left: `${x2 - 8}px`, top: `${y1 - 8}px` }}>
                <div className={`absolute top-[7px] left-0 w-4 h-[2px] ${crosshairBg} shadow-sm`} />
                <div className={`absolute top-0 left-[7px] w-[2px] h-4 ${crosshairBg} shadow-sm`} />
              </div>
              {/* Bottom-Left Crosshair */}
              <div className="absolute w-4 h-4" style={{ left: `${x1 - 8}px`, top: `${y2 - 8}px` }}>
                <div className={`absolute top-[7px] left-0 w-4 h-[2px] ${crosshairBg} shadow-sm`} />
                <div className={`absolute top-0 left-[7px] w-[2px] h-4 ${crosshairBg} shadow-sm`} />
              </div>
              {/* Bottom-Right Crosshair */}
              <div className="absolute w-4 h-4" style={{ left: `${x2 - 8}px`, top: `${y2 - 8}px` }}>
                <div className={`absolute top-[7px] left-0 w-4 h-[2px] ${crosshairBg} shadow-sm`} />
                <div className={`absolute top-0 left-[7px] w-[2px] h-4 ${crosshairBg} shadow-sm`} />
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
