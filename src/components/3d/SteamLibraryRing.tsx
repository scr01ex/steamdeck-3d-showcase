'use client'

import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { showcaseState } from './deckState'
import { soundManager } from '../../audio/soundEngine'
import {
  getPlanetVideoController,
  getRingVideoController,
  getPlanetPosterTexture,
  getRingPosterTexture,
  planetPreloadState,
} from './planetPreloadState'

const LIBRARY_GAMES = [
  { id: 'elden_ring', title: 'ELDEN RING' },
  { id: 'witcher3', title: 'THE WITCHER 3' },
  { id: 'rdr2', title: 'RED DEAD REDEMPTION 2' },
  { id: 'cyberpunk', title: 'CYBERPUNK 2077' },
  { id: 'bg3', title: "BALDUR'S GATE 3" },
  { id: 'wukong', title: 'BLACK MYTH: WUKONG' },
  { id: 'metro_exodus', title: 'METRO EXODUS' },
  { id: 'tlou', title: 'THE LAST OF US PART I' },
  { id: 'detroit', title: 'DETROIT: BECOME HUMAN' },
  { id: 'hades', title: 'HADES' },
  { id: 'deep_rock', title: 'DEEP ROCK GALACTIC' },
  { id: 'helldivers2', title: 'HELLDIVERS 2' },
  { id: 'stardew_valley', title: 'STARDEW VALLEY' },
  { id: 'hotline_miami', title: 'HOTLINE MIAMI' },
  { id: 'terraria', title: 'TERRARIA' },
  { id: 'tsushima', title: 'GHOST OF TSUSHIMA' },
]

const RING_RADIUS = 4.2
const NUM_RING_SCREENS = LIBRARY_GAMES.length
const SCREEN_WIDTH = 1.45
const SCREEN_HEIGHT = 0.90

// Reusable module-level scratch objects to eliminate per-frame GC allocations
const _tempCurvePt = new THREE.Vector3()
const _tempCurveTangent = new THREE.Vector3()
const _tempAcousticPos = new THREE.Vector3()
const _tempProjectedPos = new THREE.Vector3()
const _curPose = { wx: 0, wy: 0, wz: 0, isStreamA: true }
const _nextPose = { wx: 0, wy: 0, wz: 0, isStreamA: true }

export function SteamLibraryRing() {
  const mainGroupRef = useRef<THREE.Group>(null)
  const planetCoreRef = useRef<THREE.Group>(null)
  const ringGroupRef = useRef<THREE.Group>(null)
  const equatorLineRef = useRef<THREE.Line>(null)
  const bladesRef = useRef<(THREE.Group | null)[]>([])

  const currentRotRef = useRef(0)
  const velocityRef = useRef(0.09)
  const targetRotRef = useRef(0)
  const isTargetingRef = useRef(false)
  const isDraggingRef = useRef(false)
  const isPointerPressedRef = useRef(false)
  const isPointerTouchRef = useRef(false)
  const isWheelSpinningRef = useRef(false)
  const isManualInteractionRef = useRef(false)
  const dragStartPointerX = useRef(0)
  const dragStartRotation = useRef(0)
  const dragLastX = useRef(0)
  const dragLastTime = useRef(0)
  const dragVelocity = useRef(0)
  const activeLeadIdxRef = useRef(0)
  const flightSpeedBoostRef = useRef(0)
  const initialPortalVelocityRef = useRef(0.085)
  const lastPortalPhaseRef = useRef<'idle' | 'opening' | 'closing'>('idle')
  const scene5HighwayTimeRef = useRef(0)

  // 3D closed loop curve for continuous flight ribbon of screens in Scene 4:
  const scene4LoopCurve = useMemo(() => {
    const pts = [
      new THREE.Vector3(3.7, 0.2, 5.2),    // 0: Center foreground (right before camera, world X ≈ 0)
      new THREE.Vector3(6.5, 1.2, 4.6),    // 1: Rising into right foreground
      new THREE.Vector3(8.6, 0.9, 3.0),    // 2: Right crest
      new THREE.Vector3(8.7, -0.7, 1.4),   // 3: Right flank descending
      new THREE.Vector3(7.0, -1.8, 0.3),   // 4: Right bottom sweep
      new THREE.Vector3(4.2, -2.2, -1.4),  // 5: Underneath center, sweeping back
      new THREE.Vector3(1.6, -1.8, -2.8),  // 6: Behind center
      new THREE.Vector3(-2.2, -0.6, -2.8), // 7: Behind left, clear of planet
      new THREE.Vector3(-3.8, 0.4, 0.6),   // 8: Outer left flank, framing planet
      new THREE.Vector3(-2.4, 1.6, 3.5),   // 9: Rising over left side
      new THREE.Vector3(0.6, 1.3, 4.8),    // 10: Arcing back into center foreground
    ]
    return new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  }, [])

  const { gl, scene, camera } = useThree()

  // Centralized preloaded video controllers and textures
  const planetLooper = useMemo(() => getPlanetVideoController(), [])
  const ringLooper = useMemo(() => getRingVideoController(), [])
  const planetPosterTexture = useMemo(() => getPlanetPosterTexture(), [])
  const ringPosterTexture = useMemo(() => getRingPosterTexture(), [])

  const [isPlanetReady, setIsPlanetReady] = useState(() => planetLooper?.isReady ?? false)
  const [isRingReady, setIsRingReady] = useState(() => ringLooper?.isReady ?? false)

  useEffect(() => {
    if (planetLooper?.isReady) setIsPlanetReady(true)
    if (ringLooper?.isReady) setIsRingReady(true)
    const unsub = planetPreloadState.subscribe(() => {
      if (planetPreloadState.planetVideoReady) setIsPlanetReady(true)
      if (planetPreloadState.ringVideoReady) setIsRingReady(true)
    })

    const isScene3Active = (sc: number) => sc === 3 || sc === 4 || sc === 5

    // Pre-start playback upon initiating portal transitions towards Scenes 3, 4, or 5:
    const unsubPortal = showcaseState.onPortalChange(({ targetScene }) => {
      if (targetScene && isScene3Active(targetScene)) {
        planetLooper?.prepare()
        ringLooper?.prepare()
        planetLooper?.resume()
        ringLooper?.resume()
      }
    })

    // Manage playback upon active scene change:
    const unsubScene = showcaseState.onActiveSceneChange((scene) => {
      isManualInteractionRef.current = false
      if (isScene3Active(scene)) {
        planetLooper?.resume()
        ringLooper?.resume()
      } else {
        const isHeadingTo3 =
          (showcaseState.portalPhase === 'closing' || showcaseState.portalPhase === 'opening') &&
          showcaseState.portalTargetScene &&
          isScene3Active(showcaseState.portalTargetScene)
        if (!isHeadingTo3) {
          planetLooper?.pause()
          ringLooper?.pause()
        }
      }
    })

    return () => {
      unsub()
      unsubPortal()
      unsubScene()
      soundManager.updatePlanetWind(0, 'idle', 0)
    }
  }, [planetLooper, ringLooper])

  // 0c. UV-mapped (4x4 atlas) geometries for each of the 16 ring screens
  const bladeVideoGeometries = useMemo(() => {
    return LIBRARY_GAMES.map((_, idx) => {
      const geom = new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT)
      const col = idx % 4
      const row = Math.floor(idx / 4)
      const u0 = col * 0.25
      const u1 = (col + 1) * 0.25
      const v0 = (3 - row) * 0.25
      const v1 = (4 - row) * 0.25

      const uvs = new Float32Array([
        u0, v1, // top-left
        u1, v1, // top-right
        u0, v0, // bottom-left
        u1, v0, // bottom-right
      ])
      geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      return geom
    })
  }, [])

  // 0d. Chassis geometry and bezel edge buffer (shared across all 16 screens)
  const boxBodyGeom = useMemo(() => new THREE.BoxGeometry(SCREEN_WIDTH + 0.02, SCREEN_HEIGHT + 0.02, 0.028), [])
  const boxEdgeGeom = useMemo(() => new THREE.EdgesGeometry(boxBodyGeom), [boxBodyGeom])

  // 0e. Faceted crystal shard geometry (diamond blade with contour edges)
  const shardBodyGeom = useMemo(() => {
    const geom = new THREE.OctahedronGeometry(0.30, 0)
    geom.scale(0.46, 1.55, 0.46)
    return geom
  }, [])
  const shardTrailGeom = useMemo(() => {
    const geom = new THREE.OctahedronGeometry(0.14, 0)
    geom.scale(0.38, 1.1, 0.38)
    return geom
  }, [])

  // 0f. Shared materials for all 16 screens (eliminates redundant allocations and GPU shader switches)
  const frontVideoTexture = (isRingReady && ringLooper?.texture) ? ringLooper.texture : (ringPosterTexture ?? undefined)
  const sharedFrontMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: frontVideoTexture,
      color: 0xffffff,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      transparent: true,
      opacity: 1.0,
    })
  }, [])

  const sharedBackMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: frontVideoTexture,
      color: 0xffffff,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      transparent: true,
      opacity: 1.0,
    })
  }, [])

  // 0g. Planet core texture: 120-game video atlas or high-resolution poster
  const planetVideoTexture = (isPlanetReady && planetLooper?.texture) ? planetLooper.texture : (planetPosterTexture ?? undefined)
  const sharedPlanetMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: planetVideoTexture,
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0.0,
    })
  }, [])

  useEffect(() => {
    let needsCompile = false
    if (frontVideoTexture) {
      if (sharedFrontMaterial.map !== frontVideoTexture) {
        sharedFrontMaterial.map = frontVideoTexture
        sharedFrontMaterial.needsUpdate = true
        needsCompile = true
      }
      if (sharedBackMaterial.map !== frontVideoTexture) {
        sharedBackMaterial.map = frontVideoTexture
        sharedBackMaterial.needsUpdate = true
        needsCompile = true
      }
    }
    if (planetVideoTexture) {
      if (sharedPlanetMaterial.map !== planetVideoTexture) {
        sharedPlanetMaterial.map = planetVideoTexture
        sharedPlanetMaterial.needsUpdate = true
        needsCompile = true
      }
    }
    if (needsCompile && gl && scene && camera && mainGroupRef.current) {
      try {
        const wasVisible = mainGroupRef.current.visible
        mainGroupRef.current.visible = true
        gl.compile(scene, camera)
        mainGroupRef.current.visible = wasVisible
      } catch (_) {}
    }
  }, [frontVideoTexture, planetVideoTexture, sharedFrontMaterial, sharedBackMaterial, sharedPlanetMaterial, gl, scene, camera])

  // Precompile all 16 displays and planet core into VRAM during preloader mount
  useEffect(() => {
    if (gl && scene && camera && mainGroupRef.current) {
      try {
        const wasVisible = mainGroupRef.current.visible
        const wasCoreVisible = planetCoreRef.current?.visible ?? false
        mainGroupRef.current.visible = true
        if (planetCoreRef.current) planetCoreRef.current.visible = true
        gl.compile(scene, camera)
        mainGroupRef.current.visible = wasVisible
        if (planetCoreRef.current) planetCoreRef.current.visible = wasCoreVisible
        planetPreloadState.markShadersCompiled()
      } catch (_) {}
    }
  }, [gl, scene, camera])

  const sharedEdgeMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.45,
    })
  }, [])

  const sharedBodyMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.25,
      metalness: 0.12,
      transparent: true,
      opacity: 1.0,
    })
  }, [])

  const sharedShardMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      transparent: true,
      opacity: 1.0,
    })
  }, [])

  const sharedShardTrailMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
    })
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__bladesRef = bladesRef
    }
    // Initialize random starting game on orbit to vary initial display
    const initialIdx = showcaseState.pickNextRandomLibraryIndex()
    const stepAngle = (Math.PI * 2) / NUM_RING_SCREENS
    currentRotRef.current = -initialIdx * stepAngle
    showcaseState.currentRingRotation = currentRotRef.current
    showcaseState.setLibraryIndex(initialIdx)
  }, [])

  // 2. Combined planet coordinate wireframe grid (single BufferGeometry in 1 draw call)
  const planetGridGeometry = useMemo(() => {
    const radius = 2.415
    const positions: number[] = []

    // 9 latitude parallels
    const latAngles = [-72, -54, -36, -18, 0, 18, 36, 54, 72]
    latAngles.forEach((lat) => {
      const phi = (lat * Math.PI) / 180
      const rSub = radius * Math.cos(phi)
      const y = radius * Math.sin(phi)
      const segs = 64
      for (let i = 0; i < segs; i++) {
        const theta1 = (i / segs) * Math.PI * 2
        const theta2 = ((i + 1) / segs) * Math.PI * 2
        positions.push(
          Math.sin(theta1) * rSub, y, Math.cos(theta1) * rSub,
          Math.sin(theta2) * rSub, y, Math.cos(theta2) * rSub
        )
      }
    })

    // 6 longitude meridians
    const lonAngles = [0, 30, 60, 90, 120, 150]
    lonAngles.forEach((lon) => {
      const rotY = (lon * Math.PI) / 180
      const segs = 64
      for (let i = 0; i < segs; i++) {
        const theta1 = (i / segs) * Math.PI * 2
        const theta2 = ((i + 1) / segs) * Math.PI * 2
        const p1 = new THREE.Vector3(Math.sin(theta1) * radius, Math.cos(theta1) * radius, 0)
        p1.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
        const p2 = new THREE.Vector3(Math.sin(theta2) * radius, Math.cos(theta2) * radius, 0)
        p2.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
      }
    })

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geom
  }, [])

  const equatorGeometry = useMemo(() => {
    const eqPts: number[] = []
    const eqSegs = 80
    for (let i = 0; i <= eqSegs; i++) {
      const theta = (i / eqSegs) * Math.PI * 2
      eqPts.push(Math.sin(theta) * RING_RADIUS, 0, Math.cos(theta) * RING_RADIUS)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(eqPts, 3))
    return geom
  }, [])

  // 3. UI sector switching and scroll rotation impulse handlers
  useEffect(() => {
    showcaseState.rotateToLibraryIndex = (index: number) => {
      isWheelSpinningRef.current = false
      const normalizedIdx = (index % NUM_RING_SCREENS + NUM_RING_SCREENS) % NUM_RING_SCREENS
      activeLeadIdxRef.current = normalizedIdx
      const stepAngle = (Math.PI * 2) / NUM_RING_SCREENS
      const current = currentRotRef.current
      const targetBase = -normalizedIdx * stepAngle
      const diff = ((targetBase - current) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI
      targetRotRef.current = current + diff
      isTargetingRef.current = true
      velocityRef.current = (diff >= 0 ? 1 : -1) * 2.5
    }

    showcaseState.addRingRotationImpulse = (impulse: number, isWheel = false) => {
      isTargetingRef.current = false
      const isMobileTouch = !isWheel && typeof window !== 'undefined' && window.innerWidth <= 880
      const impulseScale = isMobileTouch ? 0.5 : 2.4
      velocityRef.current += impulse * impulseScale

      const boostScale = isMobileTouch ? 0.2 : 2.5
      flightSpeedBoostRef.current = Math.sign(velocityRef.current) * (Math.abs(flightSpeedBoostRef.current) + Math.abs(impulse) * boostScale)

      const maxVelocity = isMobileTouch ? 0.95 : 9.0
      velocityRef.current = Math.max(-maxVelocity, Math.min(maxVelocity, velocityRef.current))
      showcaseState.ringVelocity = velocityRef.current
      if (isWheel) {
        if (Math.abs(velocityRef.current) >= 0.55) {
          isWheelSpinningRef.current = true
        }
      } else {
        isWheelSpinningRef.current = false
      }
    }

    return () => {
      showcaseState.addRingRotationImpulse = () => {}
    }
  }, [])

  // 4. Pointer drag & wheel physics with inertia preservation
  useEffect(() => {
    const dom = gl.domElement
    if (!dom) return

    let startX = 0
    let startY = 0

    const handlePointerDown = (e: PointerEvent) => {
      // Ignore interactions originating from overlay UI controls (header, navigation, links, buttons):
      const targetEl = e.target as HTMLElement | null
      if (
        targetEl?.closest('header, nav, button, a, [role="button"], input, .hud-link-hover') ||
        showcaseState.isTransitioning ||
        showcaseState.scene4Phase !== 'idle' ||
        showcaseState.portalPhase !== 'idle'
      ) {
        return
      }

      if (showcaseState.activeScene !== 3 && showcaseState.offset < 0.74 && showcaseState.activeScene !== 4) return
      isPointerPressedRef.current = true
      isPointerTouchRef.current = e.pointerType === 'touch'
      showcaseState.isHoldingRing = true
      isWheelSpinningRef.current = false
      isDraggingRef.current = false
      isTargetingRef.current = false
      startX = e.clientX
      startY = e.clientY
      dragStartPointerX.current = e.clientX
      dragStartRotation.current = currentRotRef.current
      dragLastX.current = e.clientX
      dragLastTime.current = performance.now()
      dragVelocity.current = velocityRef.current
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerPressedRef.current) return
      isWheelSpinningRef.current = false

      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const isTouch = isPointerTouchRef.current || e.pointerType === 'touch'

      // Drag detection deadzone (4px) to distinguish drag from tap/click:
      if (!isDraggingRef.current) {
        const isDragActive = isTouch
          ? Math.abs(dx) > 6 && Math.abs(dx) >= Math.abs(dy)
          : Math.abs(dx) > 4 || Math.abs(dy) > 4
        if (isDragActive) {
          isDraggingRef.current = true
          isManualInteractionRef.current = true
          showcaseState.isHoldingRing = true
          dragStartPointerX.current = e.clientX
          dragStartRotation.current = currentRotRef.current
          dragLastX.current = e.clientX
          dragLastTime.current = performance.now()
          dom.style.cursor = 'grabbing'
        } else {
          return
        }
      }

      showcaseState.isHoldingRing = true
      const now = performance.now()
      const dt = Math.max(1, now - dragLastTime.current)
      const stepDx = e.clientX - dragLastX.current
      
      const dragScale = isTouch ? 1.2 : 4.5
      // Instantaneous drag velocity (rad/s):
      const instV = (stepDx / window.innerWidth) * dragScale / (dt / 1000)
      dragVelocity.current = dragVelocity.current * 0.35 + instV * 0.65
      velocityRef.current = dragVelocity.current

      dragLastX.current = e.clientX
      dragLastTime.current = now

      const totalDx = e.clientX - dragStartPointerX.current
      currentRotRef.current = dragStartRotation.current + (totalDx / window.innerWidth) * dragScale
    }

    const handlePointerUp = () => {
      if (!isPointerPressedRef.current && !isDraggingRef.current && !showcaseState.isHoldingRing) return
      const wasTouch = isPointerTouchRef.current
      isPointerPressedRef.current = false
      isPointerTouchRef.current = false
      showcaseState.isHoldingRing = false
      isWheelSpinningRef.current = false

      if (isDraggingRef.current) {
        isDraggingRef.current = false
        dom.style.cursor = 'default'

        const now = performance.now()
        const maxMomentum = wasTouch ? 0.95 : 8.5
        if (now - dragLastTime.current < 90) {
          // Transfer accumulated drag momentum upon release:
          velocityRef.current = Math.max(-maxMomentum, Math.min(maxMomentum, dragVelocity.current))
        } else {
          // Maintain current rotational direction into idle drift:
          const currentDir = dragVelocity.current !== 0 ? (dragVelocity.current >= 0 ? 1 : -1) : (velocityRef.current >= 0 ? 1 : -1)
          velocityRef.current = currentDir * 0.085
        }
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (showcaseState.activeScene !== 3 && showcaseState.offset < 0.74 && showcaseState.activeScene !== 4) return
      if (e.deltaY < -25 || e.deltaY > 25 || showcaseState.isTransitioning) return

      e.preventDefault()
      const impulse = (e.deltaY * 0.0035) + (e.deltaX ? e.deltaX * 0.0035 : 0)
      if (showcaseState.addRingRotationImpulse) {
        showcaseState.addRingRotationImpulse(impulse, true)
      }
    }

    dom.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('blur', handlePointerUp)
    dom.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      dom.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('blur', handlePointerUp)
      dom.removeEventListener('wheel', handleWheel)
    }
  }, [gl])

  // 5. Animation loop and physics
  useFrame((state, delta) => {
    if (!mainGroupRef.current) return

    const isScene3or4OrPortal =
      showcaseState.activeScene === 3 ||
      showcaseState.activeScene === 4 ||
      showcaseState.activeScene === 5 ||
      showcaseState.scene5Progress > 0.0001 ||
      showcaseState.portalPhase !== 'idle' ||
      showcaseState.offset >= 0.70

    // Background update of planet and ring video textures:
    // When scene is hidden, retain initial frame to avoid continuous PCIe transfer.
    planetLooper?.update(isScene3or4OrPortal)
    ringLooper?.update(isScene3or4OrPortal)

    if (!isScene3or4OrPortal) {
      soundManager.updatePlanetWind(0, 'idle', 0)
      mainGroupRef.current.visible = false
      return
    }
    mainGroupRef.current.visible = true

    const offset = showcaseState.offset
    const progress = THREE.MathUtils.smoothstep(offset, 0.70, 0.86)

    const portalPhase = showcaseState.portalPhase
    if (portalPhase !== 'idle') {
      isManualInteractionRef.current = false
    }
    if (portalPhase === 'idle' && lastPortalPhaseRef.current !== 'idle') {
      isManualInteractionRef.current = false
    }
    if (portalPhase !== 'idle' && lastPortalPhaseRef.current === 'idle') {
      // Cache planet angular velocity at portal start:
      initialPortalVelocityRef.current = velocityRef.current
    }
    lastPortalPhaseRef.current = portalPhase

    // 1. Cinematic acceleration and spin during Portal Wipe transition:
    if (portalPhase !== 'idle') {
      const p = showcaseState.portalProgress
      const v0 = initialPortalVelocityRef.current

      const isDirectPortal5This =
        showcaseState.portalSourceScene === 5 || showcaseState.portalTargetScene === 5

      if (isDirectPortal5This) {
        // Direct 1/2 <-> 5 portal has no planet core; crystals maintain gentle organic drift (0.075 rad/s):
        const rotDir = v0 >= 0 ? 1 : -1
        velocityRef.current = THREE.MathUtils.damp(velocityRef.current, rotDir * 0.075, 4.0, delta)
        currentRotRef.current += velocityRef.current * delta
      } else if (portalPhase === 'closing') {
        const isFromScene4 = showcaseState.portalSourceScene === 4
        // Cinematic peak reverse spin:
        // Orbit Scene 4: -4.8 rad/s
        // Scene 3: -5.2 rad/s
        const vPeak = isFromScene4 ? -4.8 : -5.2
        const u = Math.max(0, Math.min(1, 1.0 - p))
        const safeV0 = THREE.MathUtils.clamp(v0, -3.5, 0.2)

        // Target velocity profile from initial v0 to vPeak:
        let targetV = vPeak
        if (u < 0.45) {
          // Harmonic acceleration from current v0:
          const w = u / 0.45
          const ease = w * w * (3 - 2 * w)
          targetV = THREE.MathUtils.lerp(safeV0, vPeak, ease)
        } else if (u < 0.85) {
          // Hold velocity peak across center aperture above Steam Deck:
          targetV = vPeak
        } else {
          // Soft easing prior to portal seam closure:
          const w = (u - 0.85) / 0.15
          const ease = w * w * (3 - 2 * w)
          targetV = THREE.MathUtils.lerp(vPeak, isFromScene4 ? -2.0 : -2.5, ease)
        }

        // Velocity damping integration:
        const dampRate = isFromScene4 ? 2.8 : 3.5
        velocityRef.current = THREE.MathUtils.damp(velocityRef.current, targetV, dampRate, delta)
        currentRotRef.current += velocityRef.current * delta
      } else {
        // Transition into Scene 3 (portal opening from Scene 1 or 2):
        // Accelerate sphere synchronously with aperture opening:
        const vMax = 9.8
        const vEnd = 3.4
        let spinSpeed = vMax
        if (p < 0.30) {
          // Dynamic acceleration synchronous with opening:
          const w = p / 0.30
          const ease = w * w * (3 - 2 * w)
          spinSpeed = THREE.MathUtils.lerp(3.2, vMax, ease)
        } else if (p <= 0.65) {
          // Hold peak velocity during closeup reveal:
          spinSpeed = vMax
        } else {
          // Decelerate toward cruising speed:
          const w = (p - 0.65) / 0.35
          const ease = w * w * (3 - 2 * w)
          spinSpeed = THREE.MathUtils.lerp(vMax, vEnd, ease)
        }
        velocityRef.current = spinSpeed
        currentRotRef.current += velocityRef.current * delta
      }
    } else if (isTargetingRef.current) {
      // 2. Smooth approach to selected sector via rotateToLibraryIndex
      const prevRot = currentRotRef.current
      currentRotRef.current = THREE.MathUtils.damp(
        currentRotRef.current,
        targetRotRef.current,
        4.5,
        delta
      )
      velocityRef.current = delta > 0.0001 ? (currentRotRef.current - prevRot) / delta : 0
      if (Math.abs(targetRotRef.current - currentRotRef.current) < 0.003) {
        isTargetingRef.current = false
        velocityRef.current = 0.085
      }
    } else if (isDraggingRef.current) {
      // 2b. Dragging planet / orbit via pointer or touch
      const timeSinceLastDrag = performance.now() - dragLastTime.current
      if (timeSinceLastDrag > 75) {
        dragVelocity.current = THREE.MathUtils.damp(dragVelocity.current, 0, 8.0, delta)
      }
      velocityRef.current = dragVelocity.current
    } else {
      // 3. Inertial physics rotation preserving current direction:
      const s4 = showcaseState.scene4Progress
      const s5 = showcaseState.scene5Progress
      const isScene3 = showcaseState.activeScene === 3 || offset >= 0.76
      const isTransitioningScene4 = showcaseState.scene4Phase === 'transitioning'
      const isReturningToScene3 = isTransitioningScene4 && showcaseState.scene4TargetScene === 3
      const isAdvancingToScene4 = isTransitioningScene4 && showcaseState.scene4TargetScene === 4

      const isTransitioningScene5 = showcaseState.scene5Phase === 'transitioning'
      const isAdvancingToScene5 = isTransitioningScene5 && showcaseState.scene5TargetScene === 5

      const isScene4Active = s4 > 0.0001 || showcaseState.activeScene === 4 || isAdvancingToScene4 || isReturningToScene3 || isAdvancingToScene5

      // Current rotation direction (1 for forward, -1 for reverse):
      const rotDir = velocityRef.current >= 0 ? 1 : -1

      if (isScene4Active) {
        flightSpeedBoostRef.current = THREE.MathUtils.damp(flightSpeedBoostRef.current, 0, 2.0, delta)
        const targetCruisingSpeed = rotDir * (0.075 + Math.abs(flightSpeedBoostRef.current))
        
        // 1. Cinematic forward roll when transitioning from planet to orbit (3 -> 4):
        const isForwardBoost3to4 = isAdvancingToScene4 && s4 < 0.94
        const forwardSpeed3to4 = THREE.MathUtils.lerp(1.40, 0.075, Math.pow(s4, 1.2))
        
        const isDirectPortal5Early = showcaseState.portalPhase !== 'idle' &&
          (showcaseState.portalSourceScene === 5 || showcaseState.portalTargetScene === 5)
        const isForwardBoost4to5 = !isDirectPortal5Early && isAdvancingToScene5 && s5 < 0.22

        const isDynamicSpin = isForwardBoost4to5 || isReturningToScene3 || isForwardBoost3to4

        // Approached state in Scene 4:
        const isApproached = (s4 >= 0.94 || showcaseState.activeScene === 4) && !isForwardBoost4to5 && !isReturningToScene3 && !isForwardBoost3to4

        const returnSpeed = s4 > 0.32
          ? -4.2
          : THREE.MathUtils.lerp(-0.085, -4.2, s4 / 0.32)

        const targetSpeed = isReturningToScene3
          ? returnSpeed // Reverse spin when returning to Scene 3
          : (isForwardBoost4to5
              ? (s5 < 0.14 ? 4.2 : THREE.MathUtils.lerp(4.2, 0.075, (s5 - 0.14) / 0.08)) // Acceleration boost before crystal transformation
              : (isForwardBoost3to4
                  ? forwardSpeed3to4 // Forward rotation during 3 -> 4 transition
                  : targetCruisingSpeed))

        if (isApproached && Math.abs(flightSpeedBoostRef.current) > 0.04) {
          const friction = Math.exp(-1.4 * delta)
          velocityRef.current *= friction
        } else if (isApproached && Math.abs(velocityRef.current) > 0.085) {
          velocityRef.current = THREE.MathUtils.damp(velocityRef.current, targetCruisingSpeed, 2.5, delta)
        } else if (Math.abs(velocityRef.current) > Math.abs(targetCruisingSpeed) && !isDynamicSpin) {
          // Smooth inertial deceleration:
          const friction = Math.exp(-1.2 * delta)
          velocityRef.current *= friction
        } else {
          // Smooth approach to target speed:
          const dampRate = isReturningToScene3 ? (s4 < 0.32 ? 4.5 : 3.5) : (isForwardBoost3to4 ? 3.0 : 1.8)
          velocityRef.current = THREE.MathUtils.damp(velocityRef.current, targetSpeed, dampRate, delta)
        }
      } else {
        if (Math.abs(velocityRef.current) > 0.085) {
          // Exponential friction deceleration:
          const friction = Math.exp(-1.0 * delta)
          velocityRef.current *= friction
        } else if (isScene3) {
          // Background cosmic idle drift (preserves user-driven spin direction):
          const idleDriftSpeed = rotDir * 0.085
          velocityRef.current = THREE.MathUtils.damp(velocityRef.current, idleDriftSpeed, 2.0, delta)
        }
      }

      currentRotRef.current += velocityRef.current * delta
    }

    showcaseState.ringVelocity = velocityRef.current
    showcaseState.currentRingRotation = currentRotRef.current

    if (Math.abs(velocityRef.current) < 0.55 && !isDraggingRef.current && !isTargetingRef.current) {
      isManualInteractionRef.current = false
    }



    const s4 = showcaseState.scene4Progress
    const s5 = showcaseState.scene5Progress
    const p5 = s5

    const isDirectPortal5 = showcaseState.portalPhase !== 'idle' &&
      (showcaseState.portalSourceScene === 5 || showcaseState.portalTargetScene === 5)

    const isExiting5To3or4 = 
      (showcaseState.activeScene === 5 || showcaseState.scene5Phase === 'transitioning') &&
      (showcaseState.navTargetScene === 3 || showcaseState.navTargetScene === 4 || showcaseState.scene5TargetScene === 4)

    const isSettledInScene5 = showcaseState.activeScene === 5 && showcaseState.scene5Phase === 'idle' && !isExiting5To3or4
    const showPlanet = !isDirectPortal5 && !isSettledInScene5 && p5 < 0.98

    const s5Speed = showcaseState.scene5Speed + showcaseState.scene5Impulse
    showcaseState.scene5Impulse = THREE.MathUtils.damp(showcaseState.scene5Impulse, 0, 4.0, delta)
    scene5HighwayTimeRef.current += delta * 0.38 * s5Speed

    const cam = state.camera as THREE.PerspectiveCamera
    const aspect = cam.aspect || (state.viewport.width / state.viewport.height) || 1.777
    const isStacked = (state.size.width <= 1024) || (aspect <= 1.15)

    const numRingScreens = isStacked ? (NUM_RING_SCREENS - 1) : NUM_RING_SCREENS

    // When in orbit mode, continuously track the screen nearest to foreground
    if (s4 <= 0.05 && s5 <= 0.05 && !isTargetingRef.current) {
      const normRot = ((-currentRotRef.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const stepAngle = (Math.PI * 2) / numRingScreens
      activeLeadIdxRef.current = Math.round(normRot / stepAngle) % numRingScreens
    }

    // Planet core and ring rotations
    if (planetCoreRef.current) {
      planetCoreRef.current.rotation.y = currentRotRef.current * 0.6
      planetCoreRef.current.visible = showPlanet
    }
    if (ringGroupRef.current) {
      ringGroupRef.current.rotation.y = currentRotRef.current
    }
    if (equatorLineRef.current) {
      equatorLineRef.current.visible = false
    }

    // Dispersed spawn delays for each screen (prevents uniform pop-in):
    const SPAWN_STAGGER = [
      0.00, // Screen 0 (front)
      0.44, // Screen 1
      0.18, // Screen 2
      0.62, // Screen 3
      0.08, // Screen 4 (right flank)
      0.52, // Screen 5
      0.26, // Screen 6
      0.70, // Screen 7
      0.04, // Screen 8 (rear)
      0.48, // Screen 9
      0.22, // Screen 10
      0.66, // Screen 11
      0.12, // Screen 12 (left flank)
      0.56, // Screen 13
      0.30, // Screen 14
      0.74, // Screen 15
    ]

    let bestDist = Infinity
    let activeIdx = 0

    if (planetCoreRef.current) {
      planetCoreRef.current.position.z = 0
      planetCoreRef.current.scale.setScalar(1.0)
    }

    const aspectScale = isStacked ? THREE.MathUtils.clamp(aspect / 1.15, 0.65, 1.0) : 1.0
    const crystalMeshScale = isStacked ? THREE.MathUtils.clamp(aspect / 1.15, 0.88, 1.0) : 1.0

    bladesRef.current.forEach((blade, idx) => {
      if (!blade) return

      // Compact viewport adaptation: display 15 screens instead of 16 to avoid overlap:
      if (isStacked && idx === 14) {
        blade.visible = false
        return
      }
      const slotIdx = isStacked && idx === 15 ? 14 : idx

      const staggerVal = SPAWN_STAGGER[idx] || 0

      // Compute individual spawn progress for this screen:
      let screenProg = 1.0
      if (showcaseState.portalPhase === 'opening') {
        const p = showcaseState.portalProgress
        const startP = 0.08 + staggerVal * 0.42
        screenProg = THREE.MathUtils.clamp((p - startP) / 0.28, 0.0, 1.0)
      } else if (showcaseState.portalPhase === 'closing') {
        const p = showcaseState.portalProgress
        const startP = 0.10 + (1.0 - staggerVal) * 0.40
        screenProg = THREE.MathUtils.clamp((p - (1.0 - startP)) / 0.28, 0.0, 1.0)
      } else if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) {
        screenProg = 1.0
      } else {
        // Mouse wheel scroll progress:
        const scrollProg = THREE.MathUtils.smoothstep(offset, 0.70, 0.86)
        const startScroll = staggerVal * 0.36
        screenProg = THREE.MathUtils.clamp((scrollProg - startScroll) / 0.44, 0.0, 1.0)
      }

      // Base ring coordinates in Scene 3:
      // Desktop: 16 screens on orbit (R = 4.2, 22.5° step)
      // Mobile: 15 screens (24.0° step) to avoid card overlap
      const baseRadius = THREE.MathUtils.lerp(RING_RADIUS * 0.60, RING_RADIUS, Math.min(1.0, screenProg * 1.08))
      const angle = (slotIdx / numRingScreens) * Math.PI * 2

      // World panel angle for focus determination
      const bladeWorldAngle = (angle + currentRotRef.current) % (Math.PI * 2)
      const cosZ = Math.cos(bladeWorldAngle)
      const distToFront = Math.abs(1.0 - cosZ)

      if (distToFront < bestDist) {
        bestDist = distToFront
        activeIdx = slotIdx
      }

      // Mobile radius boost for foreground cards to prevent edge intersection
      const mobileRadiusBoost = isStacked ? (0.16 * Math.max(0, cosZ)) : 0
      const curBladeRadius = baseRadius + mobileRadiusBoost

      const ringX = Math.sin(angle) * curBladeRadius
      const ringZ = Math.cos(angle) * curBladeRadius
      const yOffset = (1.0 - screenProg) * (idx % 2 === 0 ? -0.48 : 0.38)
      const rotTwist = (1.0 - screenProg) * (idx % 2 === 0 ? 0.32 : -0.32)
      const ringRotY = angle + rotTwist

      // Smooth entry curve:
      const t = screenProg
      const easeOutBack = t < 0.001 ? 0.0001 : (1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2))
      const spawnScale = THREE.MathUtils.clamp(easeOutBack, 0.0001, 1.15)
      const focusFactor = Math.max(0, cosZ)
      const focusScale = THREE.MathUtils.lerp(1.0, 1.06, focusFactor * focusFactor)
      let targetScale = focusScale * spawnScale
      let finalRotY = ringRotY

      if (isStacked) {
        // Perspective compensation for mobile viewports (camera Z=10.85, orbit R=4.2)
        const frontWeight = Math.max(0, cosZ + 0.35) / 1.35
        const smoothFront = frontWeight * frontWeight * (3 - 2 * frontWeight)
        const mobileScale = THREE.MathUtils.lerp(1.06, 1.25, smoothFront)
        targetScale = mobileScale * spawnScale

        // Soften card tangent rotation towards camera to prevent perspective distortion
        const angleDiff = -currentRotRef.current - ringRotY
        const normDiff = ((angleDiff % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI
        finalRotY = ringRotY + normDiff * 0.28 * smoothFront
      }

      if (s4 <= 0.00001 && s5 <= 0.00001) {
        // Standard Scene 3 layout
        blade.visible = screenProg > 0.005
        blade.position.set(ringX, yOffset, ringZ)
        blade.rotation.set(0, finalRotY, 0)
        blade.scale.setScalar(THREE.MathUtils.damp(blade.scale.x, targetScale, 10.0, delta))
        if (blade.children[0]) {
          blade.children[0].visible = true
          blade.children[0].scale.set(1.0, 1.0, 1.0)
          const mat = (blade.children[0] as THREE.Mesh).material as THREE.Material
          if (mat) mat.opacity = 1.0
        }
        if (blade.children[1]) {
          blade.children[1].visible = true
          blade.children[1].scale.set(1.0, 1.0, 1.0)
          const mat = (blade.children[1] as THREE.Mesh).material as THREE.Material
          if (mat) mat.opacity = 1.0
        }
        if (blade.children[2]) {
          blade.children[2].visible = true
          blade.children[2].scale.set(1.0, 1.0, 1.0)
          const mat = (blade.children[2] as THREE.LineSegments).material as THREE.Material
          if (mat) mat.opacity = 0.45
        }
        if (blade.children[3]) {
          blade.children[3].visible = true
          blade.children[3].scale.set(1.0, 1.0, 1.0)
          const mat = (blade.children[3] as THREE.Mesh).material as THREE.Material
          if (mat) mat.opacity = 1.0
        }
        if (blade.children[4]) {
          blade.children[4].visible = false
          blade.children[4].scale.setScalar(0.0)
          blade.children[4].rotation.set(0, 0, 0)
        }
      } else {
        // --- SCENE 4: 3D UNROLLED SCREEN FLIGHT RIBBON ---
        const p = s4 * s4 * (3 - 2 * s4) // Smootherstep

        const curRot = currentRotRef.current
        const bladeParentAngle = angle + curRot
        const normAngle = ((bladeParentAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const loopU = normAngle / (Math.PI * 2)

        const targetPt = scene4LoopCurve.getPointAt(loopU, _tempCurvePt)
        const tangent = scene4LoopCurve.getTangentAt(loopU, _tempCurveTangent)

        let targetPtX = targetPt.x
        let targetPtY = targetPt.y
        let targetPtZ = targetPt.z

        if (isStacked && mainGroupRef.current) {
          const worldTargetX = (targetPt.x - 3.71) * aspectScale
          const worldTargetY = targetPt.y - 0.05
          const worldTargetZ = targetPt.z
          targetPtX = worldTargetX - mainGroupRef.current.position.x
          targetPtY = worldTargetY - mainGroupRef.current.position.y
          targetPtZ = worldTargetZ - mainGroupRef.current.position.z
        }

        // Scene 3 coordinates in planet group space (mainGroupRef):
        const x_main3 = ringX * Math.cos(curRot) + ringZ * Math.sin(curRot)
        const y_main3 = yOffset
        const z_main3 = -ringX * Math.sin(curRot) + ringZ * Math.cos(curRot)

        // Smooth transition trajectory from circular orbit to 3D wave ribbon in Scene 4:
        const x_main4 = THREE.MathUtils.lerp(x_main3, targetPtX, p)
        const y_main4 = THREE.MathUtils.lerp(y_main3, targetPtY, p)
        const z_main4 = THREE.MathUtils.lerp(z_main3, targetPtZ, p)

        // Cinematic orientation of displays along the 3D curve:
        const targetYaw = Math.atan2(-tangent.z, tangent.x)
        const targetPitch = -tangent.y * 0.35
        const targetRoll = -tangent.x * 0.15

        // Continuous seamless rotation handoff from Scene 3 to Scene 4:
        const startRotY = (isStacked ? finalRotY : ringRotY) + curRot
        let dRotY = (targetYaw - startRotY) % (Math.PI * 2)
        if (dRotY > Math.PI) dRotY -= Math.PI * 2
        if (dRotY < -Math.PI) dRotY += Math.PI * 2

        const curRotX4 = THREE.MathUtils.lerp(0, targetPitch, p)
        const curRotY_main4 = startRotY + dRotY * p
        const curRotZ4 = THREE.MathUtils.lerp(0, targetRoll, p)

        // Smooth scale interpolation:
        const targetEndScale = isStacked ? 1.05 * crystalMeshScale : 1.14
        const curScale4 = THREE.MathUtils.lerp(targetScale, targetEndScale, p)

        // --- SCENE 5: CINEMATIC DIVE & CRYSTAL TRANSFORMATION ---
        if (p5 <= 0.00001 && !isDirectPortal5) {
          // Pure Scene 4 state (no dive)
          if (blade.children[0]) {
            blade.children[0].visible = true
            blade.children[0].scale.set(1.0, 1.0, 1.0)
            const mat = (blade.children[0] as THREE.Mesh).material as THREE.Material
            if (mat) mat.opacity = 1.0
          }
          if (blade.children[1]) {
            blade.children[1].visible = true
            blade.children[1].scale.set(1.0, 1.0, 1.0)
            const mat = (blade.children[1] as THREE.Mesh).material as THREE.Material
            if (mat) mat.opacity = 1.0
          }
          if (blade.children[2]) {
            blade.children[2].visible = true
            blade.children[2].scale.set(1.0, 1.0, 1.0)
            const mat = (blade.children[2] as THREE.LineSegments).material as THREE.Material
            if (mat) mat.opacity = 0.45
          }
          if (blade.children[3]) {
            blade.children[3].visible = true
            blade.children[3].scale.set(1.0, 1.0, 1.0)
            const mat = (blade.children[3] as THREE.Mesh).material as THREE.Material
            if (mat) mat.opacity = 1.0
          }
          if (blade.children[4]) {
            blade.children[4].visible = false
            blade.children[4].scale.setScalar(0.0)
            blade.children[4].rotation.set(0, 0, 0)
          }

          const lx = x_main4 * Math.cos(curRot) - z_main4 * Math.sin(curRot)
          const ly = y_main4
          const lz = x_main4 * Math.sin(curRot) + z_main4 * Math.cos(curRot)

          blade.position.set(lx, ly, lz)
          blade.rotation.set(curRotX4, curRotY_main4 - curRot, curRotZ4)
          blade.scale.setScalar(curScale4)
          blade.visible = true
        } else {
          // Check if this is the direct button portal exit from scene 5 to scene 1 or 2:
          const isPortalExit5To1or2 = showcaseState.portalPhase === 'closing' && 
            showcaseState.portalSourceScene === 5 && 
            (showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2)

          if (isPortalExit5To1or2) {
            const exitT = 1.0 - THREE.MathUtils.clamp(p5, 0, 1)

            // Pattern evaluation helper for smooth position & tangent computation (zero GC):
            const calcExitPose = (tVal: number, out: { wx: number; wy: number; wz: number; isStreamA: boolean }) => {
              const isStreamA = idx % 2 === 0
              const k = Math.floor(idx / 2) // 0..7
              const basePhase = (k / 8) * Math.PI * 2

              // Symmetric double-helix vortex spinning gracefully:
              const spinSpeed = 4.4
              const angle = basePhase + tVal * spinSpeed + Math.pow(tVal, 1.5) * 1.5

              // Funnel convergence into the console slit (last 30% of transition):
              const funnelT = THREE.MathUtils.smoothstep(tVal, 0.65, 0.98)
              const funnelEase = 1.0 - funnelT

              // Centered compact radius that stays inside the aperture card without getting clipped:
              const baseRadius = 0.92 + (idx % 2) * 0.16
              const Rx = baseRadius * funnelEase + 0.02 * funnelT
              const Rz = baseRadius * 0.72 * funnelEase + 0.04 * funnelT

              // Vertical wave:
              const Ybase = THREE.MathUtils.lerp(0.92, 0.12, Math.pow(tVal, 1.35))
              const Yosc = Math.sin(angle * 2.0) * (0.28 * funnelEase)

              let wx = 0
              let wy = 0
              let wz = 0

              if (isStreamA) {
                wx = Math.sin(angle) * Rx
                wz = 3.75 + Math.cos(angle) * Rz
                wy = Ybase + Yosc
              } else {
                wx = -Math.sin(angle) * Rx
                wz = 3.75 - Math.cos(angle) * Rz
                wy = Ybase - Yosc
              }

              out.wx = wx
              out.wy = wy
              out.wz = wz
              out.isStreamA = isStreamA
              return out
            }

            const curPose = calcExitPose(exitT, _curPose)
            const nextPose = calcExitPose(Math.min(1.0, exitT + 0.012), _nextPose)

            // Velocity tangent vector for realistic aerodynamic flight orientation:
            const dvx = nextPose.wx - curPose.wx
            const dvy = nextPose.wy - curPose.wy
            const dvz = nextPose.wz - curPose.wz
            const horizSpeed = Math.sqrt(dvx * dvx + dvz * dvz) + 0.0001

            const targetPitch = -Math.atan2(dvy, horizSpeed)
            const targetYaw = Math.atan2(dvx, dvz)
            const spinDir = curPose.isStreamA ? 1.0 : -1.0
            const targetRoll = spinDir * (exitT * 7.5 + idx * 0.55)

            // Convert world target (wx, wy, wz) into local coordinates:
            // Since mainGroupRef is placed at (0, 0, 0) with scale 1.0 during isPortalExit5To1or2:
            const lx = curPose.wx * Math.cos(curRot) - curPose.wz * Math.sin(curRot)
            const ly = curPose.wy
            const lz = curPose.wx * Math.sin(curRot) + curPose.wz * Math.cos(curRot)

            blade.position.set(lx, ly, lz)
            blade.rotation.set(targetPitch, targetYaw - curRot, targetRoll)

            // Hide 2D card meshes (children 0..3):
            if (blade.children[0]) blade.children[0].visible = false
            if (blade.children[1]) blade.children[1].visible = false
            if (blade.children[2]) blade.children[2].visible = false
            if (blade.children[3]) blade.children[3].visible = false

            // Shard crystal (child 4):
            if (blade.children[4]) {
              blade.children[4].visible = true
              // Scale profile: smooth emergence, floating glow pulse, smooth convergence shrink:
              let shardScale = 1.25
              if (exitT < 0.12) {
                shardScale = THREE.MathUtils.lerp(0.3, 1.25, exitT / 0.12)
              } else if (exitT > 0.72) {
                const shrinkT = (exitT - 0.72) / 0.26
                shardScale = THREE.MathUtils.lerp(1.25, 0.0, THREE.MathUtils.clamp(shrinkT, 0, 1))
              } else {
                shardScale = 1.25 + Math.sin(exitT * Math.PI * 3.0 + idx) * 0.12
              }
              const shardMeshScale = isStacked ? crystalMeshScale : 1.0
              blade.children[4].scale.setScalar(shardScale * shardMeshScale)
              blade.children[4].rotation.z = Math.PI // Arrow tip leading the flight
            }

            const isGone = exitT >= 0.985
            blade.visible = !isGone
            blade.scale.setScalar(1.0)
            blade.userData = { exitT, isGone }
            return
          }

          // Staggered cascade timing along ribbon:
          const normLoop = (loopU + 0.10) % 1.0
          const cardStagger = isDirectPortal5 ? 0 : normLoop * 0.02
          const dropT = isDirectPortal5 ? p5 : THREE.MathUtils.clamp((p5 - cardStagger) / (1.0 - 0.02), 0, 1)

          // Vertical descent centered in world space [0, -worldDropH, 4.0]:
          const diveEase = THREE.MathUtils.smoothstep(dropT, 0.0, 0.88)
          const dropH = diveEase * 16.0 + dropT * 1.5

          const isDirectPortal5Enter = isDirectPortal5
          const curGroupPos = mainGroupRef.current ? mainGroupRef.current.position : null
          const centerAxisX = isDirectPortal5Enter
            ? 0.0
            : (isStacked ? (curGroupPos ? -curGroupPos.x : 1.85) : 3.71)
          const centerAxisY = isStacked && curGroupPos
            ? -dropH - (curGroupPos.y - (-0.05))
            : -dropH
          const centerAxisZ = isStacked && curGroupPos
            ? 4.0 - curGroupPos.z
            : 4.0

          // Double-helix vortex for 16 crystal shards (Stream A & B):
          const isStreamA = idx % 2 === 0
          const streamIdx = Math.floor(idx / 2)
          const baseAngle = (streamIdx / 8) * Math.PI * 2 + (isStreamA ? 0 : Math.PI / 8)

          // Smooth acceleration of spiral spin:
          const spinProgress = THREE.MathUtils.smoothstep(dropT, 0.01, 0.95)
          const helixSpin = (isStreamA ? 1.0 : -1.0) * (spinProgress * Math.PI * 5.5)
          const helixAngle = baseAngle + helixSpin

          // Breathing spiral radii as dual streams interweave:
          const wavePhase = dropT * Math.PI * 4.0
          const radiusPulse = Math.sin(wavePhase) * 0.30
          const baseR = isStacked ? 1.20 * aspectScale : 1.20
          const pulseR = isStacked ? radiusPulse * aspectScale : radiusPulse
          const rawHelixRadius = isStreamA ? (baseR + pulseR) : (baseR - pulseR)
          // On direct portal entry, crystals emerge upward from center into helix:
          const emergeT = isDirectPortal5Enter ? THREE.MathUtils.smoothstep(dropT, 0.0, 0.22) : 1.0
          const emergeRadius = THREE.MathUtils.lerp(0.18, 1.0, emergeT)
          const helixRadius = rawHelixRadius * emergeRadius

          const helixX = centerAxisX + Math.cos(helixAngle) * helixRadius
          const helixY = centerAxisY
          const helixZ = centerAxisZ + Math.sin(helixAngle) * (helixRadius * 0.60)

          // Smooth blending from Scene 4 ribbon into vortex stream (dropT: 0.0 -> 0.22):
          const blendVortex = isDirectPortal5 ? 1.0 : THREE.MathUtils.smoothstep(dropT, 0.0, 0.22)
          const vortexX = THREE.MathUtils.lerp(x_main4, helixX, blendVortex)
          const vortexY = THREE.MathUtils.lerp(y_main4, helixY, blendVortex)
          const vortexZ = THREE.MathUtils.lerp(z_main4, helixZ, blendVortex)

          // Mandala Starburst expansion:
          let scatterX = vortexX
          let scatterY = vortexY
          let scatterZ = vortexZ
          let burstT = 0
          if (dropT > 0.72) {
            burstT = THREE.MathUtils.clamp((dropT - 0.72) / 0.22, 0, 1)
            const burstEase = 1.0 - Math.pow(Math.max(0, 1.0 - burstT), 2.2)
            const radialAngle = (idx / 16) * Math.PI * 2 + (isStreamA ? 0.3 : -0.3) * burstT
            const baseRadialDist = burstEase * (2.1 + (idx % 2) * 0.4)
            const radialDist = isStacked ? baseRadialDist * aspectScale : baseRadialDist
            scatterX += Math.cos(radialAngle) * radialDist
            scatterZ += Math.sin(radialAngle) * (radialDist * 0.60)
            scatterY += Math.sin(burstT * Math.PI) * 0.1 // Zero-G float
          }

          // Metamorphosis: display into crystal shard
          // Edge roll (90°) executed first (dropT: 0.0 -> 0.15):
          const rollP = THREE.MathUtils.smoothstep(dropT, 0.0, 0.15)
          const edgeRoll = THREE.MathUtils.degToRad(90) * rollP
          const knifeYaw = curRotY_main4 + edgeRoll

          // Compress card into thin edge boundary (dropT: 0.02 -> 0.16):
          const compressP = THREE.MathUtils.smoothstep(dropT, 0.02, 0.16)
          const cardWidthScale = THREE.MathUtils.lerp(1.0, 0.04, compressP)
          const cardDepthScale = THREE.MathUtils.lerp(1.0, 0.08, compressP)
          const cardHeightScale = THREE.MathUtils.lerp(1.0, 1.15, compressP)

          // Edge dissolve (dropT: 0.15 -> 0.25):
          const dissolveP = THREE.MathUtils.smoothstep(dropT, 0.15, 0.25)
          const cardAlpha = isDirectPortal5 ? 0.0 : (1.0 - dissolveP)

          if (cardAlpha > 0.001) {
            if (blade.children[0]) {
              blade.children[0].visible = true
              blade.children[0].scale.set(cardWidthScale, cardHeightScale, 1.0)
              const mat = (blade.children[0] as THREE.Mesh).material as THREE.Material
              if (mat) mat.opacity = cardAlpha
            }
            if (blade.children[1]) {
              blade.children[1].visible = true
              blade.children[1].scale.set(cardWidthScale, cardHeightScale, 1.0)
              const mat = (blade.children[1] as THREE.Mesh).material as THREE.Material
              if (mat) mat.opacity = cardAlpha
            }
            if (blade.children[2]) {
              blade.children[2].visible = true
              blade.children[2].scale.set(cardWidthScale, cardHeightScale, cardDepthScale)
              const mat = (blade.children[2] as THREE.LineSegments).material as THREE.Material
              if (mat) mat.opacity = cardAlpha * 0.45
            }
            if (blade.children[3]) {
              blade.children[3].visible = true
              blade.children[3].scale.set(cardWidthScale, cardHeightScale, cardDepthScale)
              const mat = (blade.children[3] as THREE.Mesh).material as THREE.Material
              if (mat) mat.opacity = cardAlpha
            }
          } else {
            if (blade.children[0]) blade.children[0].visible = false
            if (blade.children[1]) blade.children[1].visible = false
            if (blade.children[2]) blade.children[2].visible = false
            if (blade.children[3]) blade.children[3].visible = false
          }

          // Crystal shard emergence (dropT >= 0.16):
          const isReverse = showcaseState.scene5TargetScene === 4 || showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2
          const isCrystalVisible = isDirectPortal5 || dropT >= 0.16
          if (blade.children[4]) {
            blade.children[4].visible = isCrystalVisible
            if (isCrystalVisible) {
              const crystalEmerge = isDirectPortal5 ? 1.0 : THREE.MathUtils.smoothstep(dropT, 0.16, 0.32)
              // Soft fade into final darkness (dropT > 0.96):
              const fadeT = dropT > 0.96 ? (dropT - 0.96) / 0.04 : 0
              const shardAlpha = Math.max(0, 1.0 - fadeT)
              const shardMeshScale = isStacked ? crystalMeshScale : 1.0
              blade.children[4].scale.setScalar(crystalEmerge * shardAlpha * shardMeshScale)
              // Reverse trajectory orientation: tip leads upward:
              blade.children[4].rotation.z = isReverse ? Math.PI : 0
            } else {
              blade.children[4].scale.setScalar(0.0)
            }
          }

          // Blade group scale pulse (crystal breathing):
          const overallMorph = THREE.MathUtils.smoothstep(dropT, 0.05, 0.28)
          const baseBladeScale = THREE.MathUtils.lerp(curScale4, 1.15, overallMorph)
          const sparkLife = THREE.MathUtils.clamp((dropT - 0.26) / 0.74, 0, 1)
          const sparkPulse = Math.sin(sparkLife * Math.PI * 0.88) * 0.18
          const currentBladeScale = baseBladeScale + sparkPulse
          blade.scale.setScalar(currentBladeScale)

          // 6. CONTINUOUS ORIENTATION AND ROTATION

          // Pitch: nose-down (18°) diving into Scene 5, nose-up (-18°) ascending back:
          const pitchP = THREE.MathUtils.smoothstep(dropT, 0.06, 0.28)
          const targetPitchDeg = isReverse ? -18 : 18
          const basePitch = THREE.MathUtils.lerp(curRotX4, THREE.MathUtils.degToRad(targetPitchDeg), pitchP)
          const flowerTilt = burstT * THREE.MathUtils.degToRad(32) * (isReverse ? -1 : 1)
          const curRotX = basePitch + flowerTilt

          // Rotation around flight axis begins smoothly from zero at dropT=0.18:
          const spinT = THREE.MathUtils.clamp((dropT - 0.18) / 0.82, 0, 1)
          const spinTurns = Math.pow(spinT, 1.35) * (Math.PI * 5.0)
          const spinDir = isStreamA ? 1.0 : -1.0
          const curRotY_main = knifeYaw + spinDir * spinTurns

          // Bank (Z):
          const bankP = THREE.MathUtils.smoothstep(dropT, 0.04, 0.24)
          let curRotZ = THREE.MathUtils.lerp(curRotZ4, 0, bankP)
          if (spinT > 0) {
            curRotZ += Math.sin(spinTurns + idx) * 0.14 * THREE.MathUtils.smoothstep(spinT, 0.0, 0.30)
          }

          const x_main = scatterX
          const y_main = scatterY
          const z_main = scatterZ

          // Transform into local ringGroupRef coordinates:
          const lx = x_main * Math.cos(curRot) - z_main * Math.sin(curRot)
          const ly = y_main
          const lz = x_main * Math.sin(curRot) + z_main * Math.cos(curRot)

          blade.position.set(lx, ly, lz)
          blade.rotation.set(curRotX, curRotY_main - curRot, curRotZ)

          const isGone = p5 >= 0.999 || dropT >= 0.995
          blade.visible = !isGone
          blade.userData = { dropT, burstT, isGone, currentBladeScale }
        }
      }
    })

    // Notify UI and state of active game index and velocity:
    const isScene3or4 =
      showcaseState.activeScene === 3 ||
      showcaseState.activeScene === 4 ||
      showcaseState.activeScene === 5 ||
      offset >= 0.76 ||
      s4 > 0.001 ||
      s5 > 0.001 ||
      showcaseState.portalPhase !== 'idle'

    if (isScene3or4) {
      if (showcaseState.activeScene === 3) {
        showcaseState.setLibraryIndex(activeIdx)
      }
      showcaseState.currentRingRotation = currentRotRef.current
      showcaseState.ringVelocity = velocityRef.current
    }

    // Interactive cursor parallax with smooth damping in Scenes 4 and 5 for alignment
    const pointerX = state.pointer.x || 0
    const pointerY = state.pointer.y || 0
    const isPortalExit5To1or2 = showcaseState.portalPhase === 'closing' && 
      showcaseState.portalSourceScene === 5 && 
      (showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2)

    // Planet position (Scene 3):
    // In stacked mode (mobile/tablet <= 1024px or portrait): planet placed below text card.
    const stackedPlanetX = aspect < 0.85 ? -2.20 : -1.85
    const stackedPlanetY = aspect < 0.85 ? -0.75 : (state.size.height < 750 ? -1.15 : -0.85)

    // In desktop mode (!isStacked):
    // Standard desktop (1440x900) locks planet at X = -3.71.
    // When the viewport narrows and remaining clearance shrinks towards minimum safe margin (36px):
    // the card stops decreasing right margin at 36px, and the planet shifts adaptively to the left,
    // ensuring the right edge of the screen ring maintains >= 36px safe clearance to the text card.
    let desktopPlanetX = -3.71
    if (!isStacked) {
      const cardW = state.size.width >= 1024 ? 420 : 380
      const dMin = 44
      const dBase = state.size.width >= 1024 ? 64 : 56
      const sMargin3 = state.size.width * 0.5 - 0.2145 * state.size.height - cardW
      const curCardRightPx = sMargin3 < 2 * dBase ? Math.max(dMin, Math.round(sMargin3 / 2)) : dBase
      const cardLeftPx = state.size.width - curCardRightPx - cardW

      const tanHalfFov = Math.tan((45 * Math.PI / 180) * 0.5)
      const visibleWorldH = 2 * 10.2 * tanHalfFov
      const pxPerUnit = state.size.height / visibleWorldH
      // Base right screen boundary of the ring at world X = -3.71 considering screen blade width:
      // Ring center world X = -3.71, radius 4.20 * scale 0.94 + screen extent 0.725 ~ 4.673
      // Relative to lookAt X (-0.85): -3.71 + 4.673 - (-0.85) = +1.813
      const baseRingRightPx = state.size.width * 0.5 + 1.813 * pxPerUnit
      const maxAllowedRingPx = cardLeftPx - dMin
      if (baseRingRightPx > maxAllowedRingPx) {
        const shiftWorldX = (baseRingRightPx - maxAllowedRingPx) / pxPerUnit
        desktopPlanetX = -3.71 - shiftWorldX
      }
    }

    const basePlanetX = isStacked ? stackedPlanetX : desktopPlanetX
    const basePlanetY = isStacked ? stackedPlanetY : -0.05
    const basePlanetZ = isStacked ? 0.40 : 0.0

    const portalPlanetY = isStacked ? (aspect < 0.85 ? 0.05 : 0.0) : -0.05
    const portalPlanetZ = 0.0

    // Cinematic 3D tilt:
    // Desktop: 0.28 / 0.22. Mobile: 0.22 / 0.18 (top-down view avoiding screen blade collapse).
    const baseRotX = isStacked ? (aspect < 0.85 ? 0.22 : 0.24) : 0.28
    const baseRotZ = isStacked ? (aspect < 0.85 ? 0.18 : 0.18) : 0.22

    if (isPortalExit5To1or2) {
      mainGroupRef.current.position.set(0, 0, 0)
      mainGroupRef.current.rotation.set(0, 0, 0)
      if (planetCoreRef.current) {
        planetCoreRef.current.scale.setScalar(1.0)
        planetCoreRef.current.visible = false
      }
    } else if (isDirectPortal5 || isSettledInScene5) {
      mainGroupRef.current.position.set(0, -0.05, 0)
      mainGroupRef.current.rotation.set(0, 0, 0)
      if (planetCoreRef.current) {
        planetCoreRef.current.scale.setScalar(1.0)
        planetCoreRef.current.visible = false
      }
    } else {
      const tiltP = s4 * s4 * (3 - 2 * s4)
      const tiltDamp = Math.max(0, (1.0 - tiltP) * (1.0 - p5))

      mainGroupRef.current.rotation.z = (baseRotZ + pointerX * -0.025) * tiltDamp
      mainGroupRef.current.rotation.x = (baseRotX + pointerY * 0.025) * tiltDamp

      let targetPlanetX = basePlanetX
      let targetPlanetY = basePlanetY
      let targetPlanetZ = basePlanetZ

      if (showcaseState.portalPhase !== 'idle') {
        const p = showcaseState.portalProgress
        if (p < 0.45) {
          targetPlanetX = 0.0
          targetPlanetY = portalPlanetY
          targetPlanetZ = portalPlanetZ
        } else {
          const glideT = (p - 0.45) / 0.55
          const easeGlide = glideT * glideT * (3 - 2 * glideT)
          targetPlanetX = THREE.MathUtils.lerp(0.0, basePlanetX, easeGlide)
          targetPlanetY = THREE.MathUtils.lerp(portalPlanetY, basePlanetY, easeGlide)
          targetPlanetZ = THREE.MathUtils.lerp(portalPlanetZ, basePlanetZ, easeGlide)
        }
      } else {
        targetPlanetX = basePlanetX
        targetPlanetY = basePlanetY
        targetPlanetZ = basePlanetZ
      }

      if (planetCoreRef.current) {
        const planetCoreScale = (isStacked && aspect < 0.85) ? 0.78 : (isStacked ? 0.82 : 1.0)
        planetCoreRef.current.scale.setScalar(planetCoreScale)
        planetCoreRef.current.visible = showPlanet
      }

      mainGroupRef.current.position.x = THREE.MathUtils.damp(
        mainGroupRef.current.position.x,
        targetPlanetX,
        showcaseState.portalPhase !== 'idle' ? 12.0 : 6.0,
        delta
      )
      mainGroupRef.current.position.y = THREE.MathUtils.damp(
        mainGroupRef.current.position.y,
        targetPlanetY,
        showcaseState.portalPhase !== 'idle' ? 12.0 : 6.0,
        delta
      )
      mainGroupRef.current.position.z = THREE.MathUtils.damp(
        mainGroupRef.current.position.z,
        targetPlanetZ,
        showcaseState.portalPhase !== 'idle' ? 12.0 : 6.0,
        delta
      )
    }

    // Balanced scale for ring and planet (uniform 0.94 on desktop and mobile):
    const baseTargetScale = 0.94

    let ringScale = baseTargetScale
    if (isPortalExit5To1or2 || isDirectPortal5 || isSettledInScene5) {
      ringScale = 1.0
    } else if (showcaseState.portalPhase !== 'idle') {
      const p = showcaseState.portalProgress
      if (p < 0.45) {
        const enterT = Math.min(1, p / 0.35)
        ringScale = THREE.MathUtils.lerp(0.82 * (baseTargetScale / 0.94), 0.88 * (baseTargetScale / 0.94), enterT)
      } else {
        const glideT = (p - 0.45) / 0.55
        const easeGlide = glideT * glideT * (3 - 2 * glideT)
        ringScale = THREE.MathUtils.lerp(0.88 * (baseTargetScale / 0.94), baseTargetScale, easeGlide)
      }
    } else if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) {
      ringScale = baseTargetScale
    } else {
      ringScale = THREE.MathUtils.lerp(0.65 * (baseTargetScale / 0.94), baseTargetScale, progress)
    }
    mainGroupRef.current.scale.setScalar(ringScale)
    mainGroupRef.current.visible = true
    window.__planetMainGroup = mainGroupRef.current

    // 3D spatial audio positioning for wind and rotation sound:
    // 1. In Scene 3, sound originates from the planet (left of center, x ≈ -3.71, projected NDC x ≈ -0.34)
    // 2. During portal aperture expansion, planet is centered (projected NDC x ≈ 0.0)
    // 3. In Scene 4 (orbit), active screen blade sits front-center (x ≈ 0, z ≈ 5.2)
    _tempAcousticPos.copy(mainGroupRef.current.position)
    if (s4 > 0.001) {
      _tempAcousticPos.x += 3.70 * s4
      _tempAcousticPos.y += 0.20 * s4
      _tempAcousticPos.z += 5.20 * s4
    }

    _tempProjectedPos.copy(_tempAcousticPos).project(state.camera)
    const acousticScreenX = THREE.MathUtils.clamp(_tempProjectedPos.x, -1.0, 1.0)
    const acousticProximity = THREE.MathUtils.clamp(s4, 0.0, 1.0)

    // Wind sound envelope and transition flags:
    const isTransitioningScene4 = showcaseState.scene4Phase === 'transitioning'
    const isTransitioningScene5 = showcaseState.scene5Phase === 'transitioning'
    const isDirectPortal5Early = showcaseState.portalPhase !== 'idle' &&
      (showcaseState.portalSourceScene === 5 || showcaseState.portalTargetScene === 5)

    let isWindTransition = false
    let windTransitionGain = 0.0

    const isTransition5to3 = (isTransitioningScene4 || isTransitioningScene5) &&
      showcaseState.portalSourceScene === 5 && showcaseState.portalTargetScene === 3

    if (!isManualInteractionRef.current && portalPhase === 'idle' && !isDirectPortal5Early) {
      const isEnteringScene5 = (isTransitioningScene5 || isTransitioningScene4) &&
        (showcaseState.intendedTargetScene === 5 || showcaseState.scene5TargetScene === 5)
      const isLeavingScene5 = isTransitioningScene5 &&
        (showcaseState.scene5TargetScene === 4 || showcaseState.intendedTargetScene === 4)

      if (isTransition5to3) {
        // Scene 5 -> Scene 3 transition (triggerScene5ToScene3, 5.4s):
        // Phase 1: Crystal ascent (s5: 1.0 -> 0.0)
        // Phase 2: Wave folds back into ring around planet (s4: 1.0 -> 0.0)
        // Crystal and orbit sounds work synchronously without pauses:
        if (s5 > 0.001) {
          // During reverse crystal flight, wind ramps up and sustains at 100%:
          const takeoffGain = s5 > 0.85
            ? Math.sin(((1.0 - s5) / 0.15) * Math.PI * 0.5)
            : 1.0
          windTransitionGain = takeoffGain
          isWindTransition = true
        } else {
          // Crystals finished flight — orbit continues spinning at full speed (-4.2 rad/s).
          // Wind sound sustains at 100% while wave collapses into ring.
          // Near the end (s4 < 0.28), gently fades into idle cosmic drift:
          const settleGain = s4 < 0.28 ? Math.sin((s4 / 0.28) * Math.PI * 0.5) : 1.0
          windTransitionGain = settleGain
          isWindTransition = windTransitionGain > 0.005 || s4 > 0.001
        }
      } else if (isEnteringScene5) {
        // Scene 3 -> 5 or 4 -> 5 transition (triggerScene3ToScene5, 5.4s):
        // 1. Ring spins up (s4: 0 -> 1, velocity up to 4.2 rad/s).
        //    Wind sound begins smoothly from 0.0 and ramps up with ring acceleration:
        const s4EntryGain = s4 < 0.35
          ? Math.sin((s4 / 0.35) * Math.PI * 0.5)
          : 1.0
        // 2. During crystal phase (s5), wind blends with crystals,
        //    fading out toward completion (s5 > 0.70) before Scene 5 cards:
        const s5WindGain = s5 < 0.70
          ? 1.0
          : 0.5 * (1 + Math.cos(((s5 - 0.70) / 0.30) * Math.PI))
        windTransitionGain = s4EntryGain * s5WindGain
        isWindTransition = s5 < 0.999
      } else if (isLeavingScene5) {
        // Scene 5 -> 4 transition (return to wave ribbon):
        const flightGain = s5 > 0.85
          ? Math.sin(((1.0 - s5) / 0.15) * Math.PI * 0.5)
          : (s5 < 0.25 ? Math.sin((s5 / 0.25) * Math.PI * 0.5) : 1.0)
        windTransitionGain = flightGain
        isWindTransition = s5 > 0.001
      } else if (isTransitioningScene4 && !isTransitioningScene5) {
        // Direct transition Scene 3 <-> Scene 4:
        const isForward3to4 = showcaseState.scene4TargetScene === 4
        if (isForward3to4) {
          // 3 -> 4: smooth wind onset during unfold and soft fade into cards:
          const directEntry = s4 < 0.30
            ? Math.sin((s4 / 0.30) * Math.PI * 0.5)
            : (s4 > 0.75 ? Math.sin(((1.0 - s4) / 0.25) * Math.PI * 0.5) : 1.0)
          windTransitionGain = directEntry
          isWindTransition = s4 < 0.999
        } else {
          // 4 -> 3: return from orbit to Scene 3:
          windTransitionGain = s4 < 0.28 ? Math.sin((s4 / 0.28) * Math.PI * 0.5) : 1.0
          isWindTransition = s4 > 0.001
        }
      }
    }

    if (Math.abs(velocityRef.current) < 0.55) {
      isWheelSpinningRef.current = false
    }

    const isRingHolding = Boolean(isDraggingRef.current || isPointerPressedRef.current || showcaseState.isHoldingRing)

    soundManager.updatePlanetWind(
      velocityRef.current,
      portalPhase,
      portalPhase !== 'idle' ? showcaseState.portalProgress : 0,
      {
        screenX: acousticScreenX,
        proximity: acousticProximity,
        isOrbitActive: s4 > 0.4,
        isManual: isWheelSpinningRef.current,
        isHolding: isRingHolding,
        isTransition: isWindTransition,
        transitionGain: windTransitionGain,
      }
    )
  })

  return (
    <group
      ref={mainGroupRef}
      position={[0, -0.05, 0]}
      rotation={[0.26, 0, 0.20]}
      visible={false}
    >
      {/* 1. Planet inner core with 120-game video atlas */}
      <group ref={planetCoreRef}>
        <mesh material={sharedPlanetMaterial}>
          <sphereGeometry args={[2.40, 64, 64]} />
        </mesh>

        {/* 2. Planetary coordinate grid rings (single draw call batch) */}
        <lineSegments geometry={planetGridGeometry}>
          <lineBasicMaterial color="#0f172a" transparent opacity={0.25} />
        </lineSegments>
      </group>

      {/* 3. Equatorial orbit guide line */}
      <lineSegments ref={equatorLineRef as any} geometry={equatorGeometry}>
        <lineBasicMaterial color="#0f172a" transparent opacity={0} visible={false} />
      </lineSegments>

      {/* 4. 16 dual-sided OLED displays */}
      <group ref={ringGroupRef}>
        {LIBRARY_GAMES.map((game, idx) => {
          const angle = (idx / NUM_RING_SCREENS) * Math.PI * 2
          const x = Math.sin(angle) * RING_RADIUS
          const z = Math.cos(angle) * RING_RADIUS
          const rotY = angle

          return (
            <group
              key={game.id}
              ref={(el) => {
                bladesRef.current[idx] = el
              }}
              position={[x, 0, z]}
              rotation={[0, rotY, 0]}
            >
              {/* Outer video plane (facing outward) */}
              <mesh position={[0, 0, 0.015]} geometry={bladeVideoGeometries[idx]} material={sharedFrontMaterial} />

              {/* Inner video plane (facing inward) */}
              <mesh position={[0, 0, -0.015]} rotation={[0, Math.PI, 0]} geometry={bladeVideoGeometries[idx]} material={sharedBackMaterial} />

              {/* Display bezel outline */}
              <lineSegments geometry={boxEdgeGeom} material={sharedEdgeMaterial} />

              {/* Physical display body */}
              <mesh geometry={boxBodyGeom} material={sharedBodyMaterial} />

              {/* 5. Crystal shard geometry */}
              <group visible={false}>
                {/* Diamond shard body */}
                <mesh geometry={shardBodyGeom} material={sharedShardMaterial} />
                {/* Trailing satellite crystal */}
                <mesh geometry={shardTrailGeom} position={[0, 0.85, 0]} material={sharedShardTrailMaterial} />
              </group>
            </group>
          )
        })}
      </group>
    </group>
  )
}
