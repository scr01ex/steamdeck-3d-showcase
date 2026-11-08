import * as THREE from 'three'
import gsap from 'gsap'
import { computeMechaPortalGeometry } from '@/lib/mechaPortalGeometry'
import { soundManager } from '../../audio/soundEngine'
import { trackEvent } from '@/lib/analytics'

/**
 * Global reactive state for Steam Deck in the 3D scene:
 * Allows scene objects and shaders to track console transforms in real time without allocations (60+ FPS).
 */
export const deckState = {
  // Current console world position (initially centered in viewport)
  position: new THREE.Vector3(0, 0.16, 7.75),
  // Previous position for velocity vector calculation
  previousPosition: new THREE.Vector3(0, 0.16, 7.75),
  // Linear velocity vector
  velocity: new THREE.Vector3(0, 0, 0),
  // Current Euler rotation
  rotation: new THREE.Euler(0.18, 0, 0),
  initialized: false,
}

export interface ScreenBounds {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
  splitX: number
  splitY: number
}

export function getScrollElement(): HTMLElement | null {
  if (showcaseState.scrollEl && typeof document !== 'undefined' && document.contains(showcaseState.scrollEl)) {
    return showcaseState.scrollEl
  }
  if (typeof document === 'undefined') return null
  const el = document.querySelector('[style*="overflow: hidden auto"], [style*="overflow: auto"], [style*="overflow: scroll"]') as HTMLElement | null
  if (el) {
    showcaseState.scrollEl = el
    return el
  }
  return null
}

/**
 * Reactive scroll and viewport state synchronizing HTML overlay with Three.js scene
 */
export const showcaseState = {
  isReady: false,
  offset: 0,
  velocity: 0,
  speedFactor: 1,
  scrollEl: null as HTMLElement | null,
  lastMousePos: null as { x: number; y: number } | null,
  activeGameIndex: 0,
  darkroomMode: false,
  darkroomProgress: 0,
  screenBounds: {
    left: 0.28,
    right: 0.72,
    top: 0.16,
    bottom: 0.58,
    width: 0.44,
    height: 0.42,
    splitX: 0.50,
    splitY: 0.37,
  } as ScreenBounds,
  onScreenBoundsChangeCallbacks: new Set<(bounds: ScreenBounds) => void>(),
  setScreenBounds(bounds: ScreenBounds) {
    this.screenBounds = bounds
    this.onScreenBoundsChangeCallbacks.forEach((cb) => cb(bounds))
  },
  onScreenBoundsChange(cb: (bounds: ScreenBounds) => void) {
    this.onScreenBoundsChangeCallbacks.add(cb)
    return () => {
      this.onScreenBoundsChangeCallbacks.delete(cb)
    }
  },
  onGameChangeCallbacks: new Set<(index: number) => void>(),
  setGame(index: number) {
    if (this.activeGameIndex !== index) {
      soundManager.playGameSwitch(index > this.activeGameIndex ? 1 : -1)
    }
    this.activeGameIndex = index
    this.onGameChangeCallbacks.forEach((cb) => cb(index))
  },
  onGameChange(cb: (index: number) => void) {
    this.onGameChangeCallbacks.add(cb)
    return () => {
      this.onGameChangeCallbacks.delete(cb)
    }
  },
  splitPos: 0.5, // 0.0 (full LCD) to 1.0 (full OLED), default 0.5 (half/half comparison)
  onSplitChangeCallbacks: new Set<(pos: number) => void>(),
  setSplitPos(pos: number) {
    const clamped = Math.max(0, Math.min(1, pos))
    this.splitPos = clamped
    this.simulateLcd = clamped < 0.999
    this.onSplitChangeCallbacks.forEach((cb) => cb(clamped))
  },
  onSplitChange(cb: (pos: number) => void) {
    this.onSplitChangeCallbacks.add(cb)
    return () => {
      this.onSplitChangeCallbacks.delete(cb)
    }
  },
  isCurtainDragging: false,
  lastCurtainDragEndTime: 0,
  setIsCurtainDragging(dragging: boolean) {
    this.isCurtainDragging = dragging
    if (!dragging) {
      this.lastCurtainDragEndTime = performance.now()
    }
  },
  simulateLcd: true,
  showBezelDiff: false, // Default false: clean 1:1 image bounds; when true: 7.0" LCD bezel overlay
  onBezelDiffChangeCallbacks: new Set<(active: boolean) => void>(),
  setShowBezelDiff(active: boolean) {
    this.showBezelDiff = active
    this.onBezelDiffChangeCallbacks.forEach((cb) => cb(active))
  },
  toggleShowBezelDiff() {
    this.setShowBezelDiff(!this.showBezelDiff)
  },
  onBezelDiffChange(cb: (active: boolean) => void) {
    this.onBezelDiffChangeCallbacks.add(cb)
    return () => {
      this.onBezelDiffChangeCallbacks.delete(cb)
    }
  },

  // Shutter transition state machine
  activeScene: 1 as 1 | 2 | 3 | 4 | 5,
  shutterPhase: 'idle' as 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom',
  isTransitioning: false,
  lastTransitionEndTime: 0,
  completeTransition() {
    this.isTransitioning = false
    this.lastTransitionEndTime = Date.now()
  },
  canTriggerTransition(): boolean {
    if (this.isTransitioning) return false
    if (this.portalPhase !== 'idle') return false
    if (this.shutterPhase !== 'idle' && this.shutterPhase !== 'darkroom') return false
    if (this.scene5Phase !== 'idle') return false
    if (this.scene4Phase !== 'idle') return false
    if (Date.now() - this.lastTransitionEndTime < 350) return false
    return true
  },
  snapSteamDeckToScene: false,
  isScene1TextComplete: false,
  requestScene2FromMobile: null as (() => void) | null,

  onShutterPhaseChangeCallbacks: new Set<(phase: 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom') => void>(),
  setShutterPhase(phase: 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom') {
    if (this.shutterPhase !== phase) {
      this.shutterPhase = phase
      if (phase === 'closing') {
        soundManager.playShutterCut('closing')
      } else if (phase === 'closed') {
        soundManager.playShutterCut('close')
      } else if (phase === 'opening') {
        soundManager.playShutterCut('open')
      }
      soundManager.setShutterPhase(phase)
    }
    this.onShutterPhaseChangeCallbacks.forEach((cb) => cb(phase))
  },
  onShutterPhaseChange(cb: (phase: 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom') => void) {
    this.onShutterPhaseChangeCallbacks.add(cb)
    return () => {
      this.onShutterPhaseChangeCallbacks.delete(cb)
    }
  },

  navTargetScene: 1 as 1 | 2 | 3 | 4 | 5,
  onNavTargetChangeCallbacks: new Set<(scene: 1 | 2 | 3 | 4 | 5) => void>(),
  setNavTargetScene(scene: 1 | 2 | 3 | 4 | 5) {
    if (this.navTargetScene === scene) return
    this.navTargetScene = scene
    this.onNavTargetChangeCallbacks.forEach((cb) => cb(scene))
  },
  onNavTargetChange(cb: (scene: 1 | 2 | 3 | 4 | 5) => void) {
    this.onNavTargetChangeCallbacks.add(cb)
    return () => {
      this.onNavTargetChangeCallbacks.delete(cb)
    }
  },

  onActiveSceneChangeCallbacks: new Set<(scene: 1 | 2 | 3 | 4 | 5) => void>(),
  setActiveScene(scene: 1 | 2 | 3 | 4 | 5) {
    this.setNavTargetScene(scene)
    if (this.activeScene === scene) return
    const prevScene = this.activeScene
    this.activeScene = scene
    trackEvent('scene_view', { scene, previous_scene: prevScene })
    if (scene !== 1) {
      this.isScene1TextComplete = false
    }
    this.isHoldingRing = false
    this.onActiveSceneChangeCallbacks.forEach((cb) => cb(scene))
  },
  onActiveSceneChange(cb: (scene: 1 | 2 | 3 | 4 | 5) => void) {
    this.onActiveSceneChangeCallbacks.add(cb)
    return () => {
      this.onActiveSceneChangeCallbacks.delete(cb)
    }
  },

  // Scene 4: Ribbon unspool and camera immersion transition
  scene4Progress: 0,
  scene4Phase: 'idle' as 'idle' | 'transitioning',
  scene4TargetScene: 3 as 3 | 4,
  intendedTargetScene: undefined as (1 | 2 | 3 | 4 | 5 | undefined),
  suppressScene3Text: false,
  onSuppressScene3TextCallbacks: new Set<(suppress: boolean) => void>(),
  setSuppressScene3Text(suppress: boolean) {
    if (this.suppressScene3Text === suppress) return
    this.suppressScene3Text = suppress
    this.onSuppressScene3TextCallbacks.forEach((cb) => cb(suppress))
  },
  onSuppressScene3Text(cb: (suppress: boolean) => void) {
    this.onSuppressScene3TextCallbacks.add(cb)
    return () => {
      this.onSuppressScene3TextCallbacks.delete(cb)
    }
  },
  onScene4ChangeCallbacks: new Set<(progress: number, phase: 'idle' | 'transitioning', targetScene: 3 | 4) => void>(),
  setScene4Progress(progress: number, phase: 'idle' | 'transitioning' = 'transitioning', targetScene?: 3 | 4) {
    this.scene4Progress = progress
    this.scene4Phase = phase
    if (targetScene !== undefined) {
      this.scene4TargetScene = targetScene
    }
    this.onScene4ChangeCallbacks.forEach((cb) => cb(progress, phase, this.scene4TargetScene))
  },
  onScene4Change(cb: (progress: number, phase: 'idle' | 'transitioning', targetScene: 3 | 4) => void) {
    this.onScene4ChangeCallbacks.add(cb)
    return () => {
      this.onScene4ChangeCallbacks.delete(cb)
    }
  },
  triggerScene4Transition(targetScene: 3 | 4, onDone?: () => void, customDuration?: number) {
    if (this.isTransitioning || this.activeScene === targetScene) return
    this.isTransitioning = true

    // Pre-switch nav target indicator to destination scene at animation start
    this.setNavTargetScene(this.intendedTargetScene || targetScene)

    const isForward = targetScene === 4
    this.scene4Phase = 'transitioning'
    this.scene4TargetScene = targetScene
    this.setScene4Progress(this.scene4Progress, 'transitioning', targetScene)

    const targetVal = isForward ? 1 : 0
    const duration = customDuration !== undefined ? customDuration : 2.4
    gsap.to(this, {
      scene4Progress: targetVal,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.setScene4Progress(this.scene4Progress, 'transitioning', targetScene)
      },
      onComplete: () => {
        this.scene4Phase = 'idle'
        this.setScene4Progress(targetVal, 'idle', targetScene)
        this.setActiveScene(targetScene)
        this.completeTransition()
        if (onDone) {
          onDone()
        }
      }
    })
  },

  // Scene 5: Rhythm Highway and spec telemetry
  scene5Progress: 0,
  scene5Phase: 'idle' as 'idle' | 'transitioning',
  scene5TargetScene: 4 as 4 | 5,
  scene5Speed: 1.0,
  scene5Impulse: 0,
  scene5VideoTime: 0,
  scene5HasBeenVisited: false,
  scene5LastExitTime: null as number | null,
  scene5TriggerMethod: 'scroll' as 'scroll' | 'click' | 'gesture' | 'code',
  addScene5Impulse(impulse: number) {
    this.scene5Impulse = Math.min(15, this.scene5Impulse + impulse)
  },
  // Scene 5: Roadmap & technical specs scroll progress
  scene5ScrollProgress: 0,
  scene5ScrollTarget: 0,
  addScene5ScrollImpulse: null as null | ((deltaY: number) => void),
  onScene5ScrollCallbacks: new Set<(progress: number) => void>(),
  setScene5ScrollProgress(progress: number) {
    this.scene5ScrollProgress = Math.max(0, Math.min(1, progress))
    this.onScene5ScrollCallbacks.forEach((cb) => cb(this.scene5ScrollProgress))
  },
  onScene5ScrollChange(cb: (progress: number) => void) {
    this.onScene5ScrollCallbacks.add(cb)
    return () => {
      this.onScene5ScrollCallbacks.delete(cb)
    }
  },
  onScene5ChangeCallbacks: new Set<(progress: number, phase: 'idle' | 'transitioning', targetScene: 4 | 5) => void>(),
  setScene5Progress(progress: number, phase: 'idle' | 'transitioning' = 'transitioning', targetScene?: 4 | 5) {
    this.scene5Progress = progress
    this.scene5Phase = phase
    if (targetScene !== undefined) {
      this.scene5TargetScene = targetScene
    }
    const isForward = (targetScene !== undefined ? targetScene : this.scene5TargetScene) === 5
    soundManager.updateCrystalMotion(phase, progress, isForward ? 'forward' : 'reverse')
    this.onScene5ChangeCallbacks.forEach((cb) => cb(progress, phase, this.scene5TargetScene))
  },
  onScene5Change(cb: (progress: number, phase: 'idle' | 'transitioning', targetScene: 4 | 5) => void) {
    this.onScene5ChangeCallbacks.add(cb)
    return () => {
      this.onScene5ChangeCallbacks.delete(cb)
    }
  },
  triggerScene5Transition(
    targetScene: 4 | 5,
    onDone?: () => void,
    customDuration?: number,
    triggerMethod: 'scroll' | 'click' | 'gesture' | 'code' = 'click'
  ) {
    if (this.isTransitioning || this.activeScene === targetScene) return
    this.isTransitioning = true

    if (targetScene === 5) {
      this.scene5TriggerMethod = triggerMethod
    }

    this.setNavTargetScene(targetScene)

    const isForward = targetScene === 5
    this.scene5Phase = 'transitioning'
    this.scene5TargetScene = targetScene
    this.setScene5Progress(this.scene5Progress, 'transitioning', targetScene)

    if (!isForward) {
      soundManager.playCrystalTransition('reverse')
      // Reverse transition (Scene 5 -> Scene 4):
      // Rapid crystal lift (~0.22s) blends with the exit cascade to maintain visual continuity.
      const exitDelay = 0.22
      const flightDuration = customDuration !== undefined ? customDuration : 3.8
      const totalDuration = exitDelay + flightDuration

      const proxy = { u: 0 }
      gsap.killTweensOf(proxy)
      gsap.to(proxy, {
        u: 1,
        duration: totalDuration,
        ease: 'none',
        overwrite: 'auto',
        onUpdate: () => {
          const u = proxy.u
          const exitRatio = exitDelay / totalDuration
          let prog = 1.0
          if (u <= exitRatio) {
            prog = 1.0
          } else {
            // Rapid crystal ascent towards camera
            const flightT = (u - exitRatio) / (1.0 - exitRatio)
            const tWarp = Math.pow(flightT, 0.82)
            prog = 0.5 * (1 + Math.cos(tWarp * Math.PI))
          }
          this.setScene5Progress(prog, 'transitioning', 4)
        },
        onComplete: () => {
          this.scene5Phase = 'idle'
          this.portalSourceScene = 5
          this.portalTargetScene = 4
          this.setScene5Progress(0, 'idle', 4)
          this.setActiveScene(4)
          this.completeTransition()
          this.setScene5ScrollProgress(0)
          this.scene5ScrollTarget = 0
          if (onDone) {
            onDone()
          }
        }
      })
      return
    }

    const targetVal = 1
    const duration = customDuration !== undefined ? customDuration : 3.8

    gsap.killTweensOf(this)
    gsap.to(this, {
      scene5Progress: targetVal,
      duration,
      ease: 'sine.inOut',
      overwrite: 'auto',
      onUpdate: () => {
        this.setScene5Progress(this.scene5Progress, 'transitioning', targetScene)
      },
      onComplete: () => {
        this.scene5Phase = 'idle'
        this.setActiveScene(targetScene)
        this.completeTransition()
        this.setScene5Progress(targetVal, 'idle', targetScene)
        if (onDone) {
          onDone()
        }
      }
    })
  },

  // 3D Library Ring / Ecosystem Sector Tracking:
  activeLibraryIndex: 0,
  recentLibraryIndices: [] as number[],
  pickNextRandomLibraryIndex(): number {
    const total = 16
    const recent = this.recentLibraryIndices
    const available: number[] = []
    for (let i = 0; i < total; i++) {
      if (!recent.includes(i)) {
        available.push(i)
      }
    }
    const pool = available.length > 0 ? available : Array.from({ length: total }, (_, i) => i).filter((i) => i !== this.activeLibraryIndex)
    const nextIdx = pool[Math.floor(Math.random() * pool.length)]
    this.recentLibraryIndices.push(nextIdx)
    if (this.recentLibraryIndices.length > 4) {
      this.recentLibraryIndices.shift()
    }
    return nextIdx
  },
  onLibraryChangeCallbacks: new Set<(index: number) => void>(),
  setLibraryIndex(index: number) {
    if (this.activeLibraryIndex === index) return
    this.activeLibraryIndex = index
    this.onLibraryChangeCallbacks.forEach((cb) => cb(index))
  },
  onLibraryChange(cb: (index: number) => void) {
    this.onLibraryChangeCallbacks.add(cb)
    return () => {
      this.onLibraryChangeCallbacks.delete(cb)
    }
  },
  targetRingRotation: 0,
  currentRingRotation: 0,
  ringVelocity: 0,
  isHoldingRing: false,
  rotateToLibraryIndex: (_index: number) => {},
  addRingRotationImpulse: (_impulse: number, _isWheel?: boolean) => {},

  // Central Expanding Portal Card Transition (Scene 1 <-> Scene 3 and Scene 2 <-> Scene 3):
  portalPhase: 'idle' as 'idle' | 'opening' | 'closing',
  portalProgress: 0,
  portalSourceScene: 2 as 1 | 2 | 3 | 4 | 5,
  portalTargetScene: 3 as 1 | 2 | 3 | 4 | 5,
  portalTriggerMethod: 'code' as 'scroll' | 'click' | 'gesture' | 'code',
  portalClipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)',
  onPortalChangeCallbacks: new Set<(data: {
    phase: 'idle' | 'opening' | 'closing'
    progress: number
    sourceScene?: 1 | 2 | 3 | 4 | 5
    targetScene?: 1 | 2 | 3 | 4 | 5
  }) => void>(),
  setPortalState(
    phase: 'idle' | 'opening' | 'closing',
    progress: number,
    sourceScene?: 1 | 2 | 3 | 4 | 5,
    targetScene?: 1 | 2 | 3 | 4 | 5
  ) {
    if (sourceScene !== undefined) this.portalSourceScene = sourceScene
    if (targetScene !== undefined) this.portalTargetScene = targetScene

    const src = sourceScene !== undefined ? sourceScene : this.portalSourceScene
    const tgt = targetScene !== undefined ? targetScene : this.portalTargetScene
    const isScene3 = src === 3 || tgt === 3
    const isScene5Portal = src === 5 || tgt === 5 || this.portalSourceScene === 5 || this.portalTargetScene === 5

    if (isScene3) {
      if (this.portalPhase !== phase && (phase === 'opening' || phase === 'closing')) {
        soundManager.playPlanetWindWhoosh(phase === 'opening' ? 'forward' : 'reverse')
      }
    } else if (isScene5Portal) {
      // Dynamic portal motion audio coupled to real-time portal aperture movement on every frame:
      soundManager.updatePortalMotion(phase, progress, src, tgt)
    }
    this.portalPhase = phase
    this.portalProgress = progress
    this.onPortalChangeCallbacks.forEach((cb) =>
      cb({ phase, progress, sourceScene: this.portalSourceScene, targetScene: this.portalTargetScene })
    )
  },
  onPortalChange(cb: (data: {
    phase: 'idle' | 'opening' | 'closing'
    progress: number
    sourceScene?: 1 | 2 | 3 | 4 | 5
    targetScene?: 1 | 2 | 3 | 4 | 5
  }) => void) {
    this.onPortalChangeCallbacks.add(cb)
    return () => {
      this.onPortalChangeCallbacks.delete(cb)
    }
  },
  onPortalClipPathCallbacks: new Set<(clipPath: string) => void>(),
  setPortalClipPath(clipPath: string) {
    this.portalClipPath = clipPath
    this.onPortalClipPathCallbacks.forEach((cb) => cb(clipPath))
  },
  onPortalClipPath(cb: (clipPath: string) => void) {
    this.onPortalClipPathCallbacks.add(cb)
    return () => {
      this.onPortalClipPathCallbacks.delete(cb)
    }
  },
  getPortalClipPath(cb: (clipPath: string) => void) {
    return this.onPortalClipPath(cb)
  },

  triggerPortalTransition(
    targetScene: 1 | 2 | 3 | 4 | 5,
    onDone?: () => void,
    customDuration?: number,
    triggerMethod?: 'scroll' | 'click' | 'gesture' | 'code'
  ) {
    if (this.isTransitioning || this.activeScene === targetScene) return
    this.isTransitioning = true

    this.setNavTargetScene(this.intendedTargetScene || targetScene)
    this.portalTriggerMethod = triggerMethod || (this.ringVelocity <= -1.2 ? 'scroll' : 'click')

    const sourceScene = this.activeScene
    this.portalSourceScene = sourceScene
    this.portalTargetScene = targetScene

    const el = getScrollElement()
    if (el) el.style.overflow = 'hidden'

    const isForward = targetScene === 3
    if (isForward && this.suppressScene3Text && (this.intendedTargetScene === undefined || this.intendedTargetScene === 3)) {
      this.setSuppressScene3Text(false)
    }
    const phase = isForward ? 'opening' : 'closing'
    const is1to3 = (sourceScene === 1 && targetScene === 3) || (sourceScene === 3 && targetScene === 1)

    let startP = 0.65
    let endP = 0.90
    if (isForward) {
      startP = sourceScene === 1 ? 0.28 : 0.65
      endP = 0.90
    } else {
      startP = 0.90
      endP = targetScene === 1 ? 0.28 : 0.65
    }

    this.setPortalState(phase, isForward ? 0 : 1, sourceScene, targetScene)

    const isScene2Involved = !is1to3 && (targetScene === 2 || (sourceScene === 2 && !isForward))
    if (isScene2Involved) {
      this.darkroomProgress = 1
      this.darkroomMode = true
    } else {
      this.darkroomProgress = 0
      this.darkroomMode = false
    }

    if (!isForward && targetScene === 1) {
      // Return to Scene 1 under closing aperture card:
      this.snapSteamDeckToScene = true
      this.offset = 0.28
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * 0.28
      }
    } else if (!is1to3) {
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * endP
      }
      this.offset = endP
    }
    // Preserving scroll offset when advancing forward from Scene 1 (isForward && sourceScene === 1)

    const proxy = { t: 0 }

    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      t: 1,
      duration: customDuration !== undefined ? customDuration : 2.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = proxy.t
        const cardProgress = isForward ? t : (1 - t)
        this.setPortalState(phase, cardProgress, sourceScene, targetScene)

        if (!is1to3) {
          const currentOffset = THREE.MathUtils.lerp(startP, endP, t)
          this.offset = currentOffset
        } else if (!isForward && targetScene === 1) {
          // Lock offset to 0.28 when returning to Scene 1 under closing aperture:
          this.offset = 0.28
        }
      },
      onComplete: () => {
        this.setActiveScene(targetScene)
        this.darkroomProgress = targetScene === 2 ? 1 : 0
        this.darkroomMode = targetScene === 2
        this.offset = endP
        if (targetScene === 2) {
          this.setShutterPhase('darkroom')
        } else {
          this.setShutterPhase('idle')
        }
        if (el) {
          const maxScroll = el.scrollHeight - el.clientHeight
          el.scrollTop = maxScroll * endP
          el.style.overflow = 'auto'
        }
        this.setPortalState('idle', isForward ? 1 : 0, targetScene, targetScene)
        this.completeTransition()
        if (onDone) onDone()
      },
    })
  },

  // Backwards compatibility alias for triggerReelTransition
  triggerReelTransition(targetScene: 1 | 2 | 3 | 4 | 5) {
    this.triggerPortalTransition(targetScene)
  },

  // Direct return from Scene 4 to Scene 1 or 2:
  // Synchronized camera pull-back, planet reverse spin, ribbon contraction, and aperture closure.
  triggerScene4ToScene1or2(targetScene: 1 | 2, customDuration?: number) {
    if (this.isTransitioning) return
    this.isTransitioning = true

    this.intendedTargetScene = targetScene
    this.setNavTargetScene(targetScene)
    this.setSuppressScene3Text(true)
    this.portalSourceScene = 4
    this.portalTargetScene = targetScene

    const el = getScrollElement()
    if (el) el.style.overflow = 'hidden'

    const isScene2 = targetScene === 2
    const endP = isScene2 ? 0.65 : 0.28

    if (isScene2) {
      this.darkroomProgress = 1
      this.darkroomMode = true
      this.setShutterPhase('darkroom')
      this.offset = 0.65
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * 0.65
      }
    } else {
      this.snapSteamDeckToScene = true
      this.darkroomProgress = 0
      this.darkroomMode = false
      this.setShutterPhase('idle')
      this.offset = 0.28
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * 0.28
      }
    }

    this.scene4Phase = 'transitioning'
    this.scene4TargetScene = 3
    this.setPortalState('closing', 1.0, 4, targetScene)

    const proxy = { t: 0 }
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      t: 1,
      duration: customDuration !== undefined ? customDuration : 2.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = proxy.t

        // Transform ribbon wave back into orbital ring:
        this.setScene4Progress(1.0 - t, 'transitioning', 3)

        // Synchronous aperture card collapse over Steam Deck:
        this.setPortalState('closing', 1.0 - t, 4, targetScene)
      },
      onComplete: () => {
        this.scene4Phase = 'idle'
        this.setScene4Progress(0, 'idle')
        this.darkroomProgress = isScene2 ? 1 : 0
        this.darkroomMode = isScene2
        this.offset = endP
        if (isScene2) {
          this.setShutterPhase('darkroom')
        } else {
          this.setShutterPhase('idle')
        }
        if (el) {
          const maxScroll = el.scrollHeight - el.clientHeight
          el.scrollTop = maxScroll * endP
          el.style.overflow = 'auto'
        }
        this.setPortalState('idle', 0, targetScene, targetScene)
        this.setActiveScene(targetScene)
        this.intendedTargetScene = undefined
        this.setSuppressScene3Text(false)
        setTimeout(() => {
          this.completeTransition()
        }, 80)
      },
    })
  },


  // Direct transition from Scene 1 or 2 to Scene 5 via aperture portal:
  // Aperture expands over descending crystal highway while background remains visible until full aperture.
  triggerDirectPortalToScene5(sourceScene: 1 | 2, customDuration?: number) {
    if (this.isTransitioning) return
    this.isTransitioning = true

    this.intendedTargetScene = 5
    this.setNavTargetScene(5)
    this.setSuppressScene3Text(true)
    this.portalSourceScene = sourceScene
    this.portalTargetScene = 5
    this.scene4Progress = 1.0 // Align coordinates to crystal trajectory
    this.scene5Phase = 'transitioning'
    this.scene5TargetScene = 5
    this.setScene5ScrollProgress(0)
    this.scene5ScrollTarget = 0

    const el = getScrollElement()
    if (el) el.style.overflow = 'hidden'

    if (sourceScene === 1) {
      this.darkroomProgress = 0
      this.darkroomMode = false
      // Console retains current position without abrupt snapping to 0.28
    } else {
      this.darkroomProgress = 1
      this.darkroomMode = true
      this.offset = 0.65
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * 0.65
        el.dispatchEvent(new Event('scroll'))
      }
    }

    this.setPortalState('opening', 0, sourceScene, 5)
    this.setScene5Progress(0, 'transitioning', 5)
    const initW = typeof window !== 'undefined' ? window.innerWidth : 1440
    const initH = typeof window !== 'undefined' ? window.innerHeight : 900
    this.setPortalClipPath(computeMechaPortalGeometry(0, 'opening', initW, initH).cssPolygon)

    const proxy = { t: 0 }
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      t: 1,
      duration: customDuration !== undefined ? customDuration : 2.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = proxy.t
        this.setPortalState('opening', t, sourceScene, 5)
        this.setScene5Progress(t, 'transitioning', 5)
        const curW = typeof window !== 'undefined' ? window.innerWidth : 1440
        const curH = typeof window !== 'undefined' ? window.innerHeight : 900
        this.setPortalClipPath(computeMechaPortalGeometry(t, 'opening', curW, curH).cssPolygon)
      },
      onComplete: () => {
        this.portalPhase = 'idle'
        this.setActiveScene(5)
        this.setNavTargetScene(5)
        this.scene5Phase = 'idle'
        this.setScene5Progress(1, 'idle', 5)
        this.setPortalState('idle', 1, sourceScene, 5)
        this.setPortalClipPath('none')
        this.completeTransition()
        this.intendedTargetScene = undefined
        this.setSuppressScene3Text(false)
        this.offset = 1.00
        if (el) {
          el.style.overflow = 'hidden'
        }
      },
    })
  },

  // Direct return from Scene 5 to Scene 1 or 2:
  // Full-screen darkroom collapses into central aperture revealing Scene 1/2 while crystals ascend in reverse.
  triggerScene5ToDirectPortal(targetScene: 1 | 2, customDuration?: number) {
    if (this.isTransitioning) return
    this.isTransitioning = true

    this.portalSourceScene = 5
    this.portalTargetScene = targetScene
    this.intendedTargetScene = targetScene
    this.setPortalState('closing', 1.0, 5, targetScene)
    this.setNavTargetScene(targetScene)
    this.setSuppressScene3Text(true)
    this.scene4Progress = 1.0
    this.scene5Phase = 'transitioning'
    this.scene5TargetScene = 4 // Signal reverse crystal ascent

    const el = getScrollElement()
    if (el) el.style.overflow = 'hidden'

    const isScene2 = targetScene === 2
    const endP = isScene2 ? 0.65 : 0.28

    if (isScene2) {
      this.darkroomProgress = 1
      this.darkroomMode = true
      this.setShutterPhase('darkroom')
      this.offset = 0.65
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * 0.65
      }
    } else {
      this.snapSteamDeckToScene = true
      this.darkroomProgress = 0
      this.darkroomMode = false
      this.setShutterPhase('idle')
      this.offset = 0.28
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = maxScroll * 0.28
      }
    }

    this.setPortalState('closing', 1.0, 5, targetScene)
    this.setScene5Progress(1.0, 'transitioning', 4)
    const initW = typeof window !== 'undefined' ? window.innerWidth : 1440
    const initH = typeof window !== 'undefined' ? window.innerHeight : 900
    this.setPortalClipPath(computeMechaPortalGeometry(1.0, 'closing', initW, initH).cssPolygon)

    const proxy = { t: 0 }
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      t: 1,
      duration: customDuration !== undefined ? customDuration : 2.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = proxy.t
        const cardProgress = 1.0 - t
        this.setPortalState('closing', cardProgress, 5, targetScene)
        this.setScene5Progress(cardProgress, 'transitioning', 4)
        const curW = typeof window !== 'undefined' ? window.innerWidth : 1440
        const curH = typeof window !== 'undefined' ? window.innerHeight : 900
        this.setPortalClipPath(computeMechaPortalGeometry(cardProgress, 'closing', curW, curH).cssPolygon)
      },
      onComplete: () => {
        this.setActiveScene(targetScene)
        this.setNavTargetScene(targetScene)
        this.portalPhase = 'idle'
        this.setPortalState('idle', 0, 5, targetScene)
        this.setPortalClipPath('polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)')
        this.scene5Phase = 'idle'
        this.scene4Progress = 0
        this.setScene5Progress(0, 'idle')
        this.setScene5ScrollProgress(0)
        this.scene5ScrollTarget = 0
        this.darkroomProgress = isScene2 ? 1 : 0
        this.darkroomMode = isScene2
        this.offset = endP
        if (isScene2) {
          this.setShutterPhase('darkroom')
        } else {
          this.setShutterPhase('idle')
        }
        if (el) {
          const maxScroll = el.scrollHeight - el.clientHeight
          el.scrollTop = maxScroll * endP
          el.style.overflow = 'auto'
          el.dispatchEvent(new Event('scroll'))
        }
        this.completeTransition()
        this.intendedTargetScene = undefined
        this.setSuppressScene3Text(false)
      },
    })
  },

  // Seamless continuous transition from Scene 3 to Scene 5:
  // Ring unspools into ribbon wave then transitions directly into crystal dive.
  triggerScene3ToScene5(customDuration?: number) {
    if (this.isTransitioning) return
    this.isTransitioning = true

    this.intendedTargetScene = 5
    this.setNavTargetScene(5)
    this.setSuppressScene3Text(false)

    this.scene4Phase = 'transitioning'
    this.scene4TargetScene = 4
    this.scene5Phase = 'transitioning'
    this.scene5TargetScene = 5
    this.setScene5ScrollProgress(0)
    this.scene5ScrollTarget = 0

    const duration = customDuration !== undefined ? customDuration : 5.4

    const proxy = { u: 0 }
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      u: 1,
      duration,
      ease: 'none',
      onUpdate: () => {
        const u = proxy.u

        // Unspool ring into ribbon wave (u: 0.0 -> 0.35, ~1.8s):
        let s4 = 1
        if (u < 0.35) {
          const t4 = u / 0.35
          s4 = 0.5 * (1 - Math.cos(t4 * Math.PI))
        } else {
          s4 = 1.0
        }
        this.setScene4Progress(s4, 'transitioning', 4)

        // Seamless blend into crystal descent (u: 0.30 -> 1.0, ~3.8s):
        // Triggered before unspool finishes to avoid lingering on intermediate wave:
        let s5 = 0
        if (u <= 0.30) {
          s5 = 0.0
        } else {
          const t5 = (u - 0.30) / 0.70
          s5 = 0.5 * (1 - Math.cos(t5 * Math.PI))
        }
        this.setScene5Progress(s5, 'transitioning', 5)
      },
      onComplete: () => {
        this.scene4Phase = 'idle'
        this.scene5Phase = 'idle'
        this.setActiveScene(5)
        this.completeTransition()
        this.intendedTargetScene = undefined
        this.setSuppressScene3Text(false)
        this.setScene4Progress(1, 'idle', 4)
        this.setScene5Progress(1, 'idle', 5)
      }
    })
  },

  // Continuous transition from Scene 5 to Scene 3:
  // Crystals ascend while planet and studio lighting fade in, blending into orbital ring.
  triggerScene5ToScene3(customDuration?: number) {
    if (this.isTransitioning) return
    this.isTransitioning = true

    this.intendedTargetScene = 3
    this.setNavTargetScene(3)
    this.setSuppressScene3Text(false)
    this.portalSourceScene = 5
    this.portalTargetScene = 3

    // Reset Scene 5 scroll and state:
    this.setScene5ScrollProgress(0)
    this.scene5ScrollTarget = 0

    this.darkroomProgress = 0
    this.darkroomMode = false
    this.offset = 0.90
    this.setShutterPhase('idle')
    this.portalPhase = 'idle'
    this.portalProgress = 1.0

    this.scene5Phase = 'transitioning'
    this.scene5TargetScene = 4 // Reverse crystal ascent
    this.scene4Phase = 'transitioning'
    this.scene4TargetScene = 3 // Collapse wave into orbital ring
    this.setScene5Progress(1.0, 'transitioning', 4)

    const exitDelay = 0.22
    const flightDuration = customDuration !== undefined ? customDuration : 5.4
    const duration = exitDelay + flightDuration

    const proxy = { u: 0 }
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      u: 1,
      duration,
      ease: 'none',
      onUpdate: () => {
        const u = proxy.u
        const exitRatio = exitDelay / duration

        // 1. Crystal ascent into screen transforms:
        let s5 = 1.0
        if (u <= exitRatio) {
          s5 = 1.0
        } else {
          const uFlight = (u - exitRatio) / (1.0 - exitRatio)
          if (uFlight < 0.70) {
            const t5 = uFlight / 0.70
            const t5Warp = Math.pow(t5, 0.82)
            s5 = 0.5 * (1 + Math.cos(t5Warp * Math.PI))
          } else {
            s5 = 0.0
          }
        }
        this.setScene5Progress(s5, 'transitioning', 4)

        // 2. Blend wave back into Scene 3 orbital ring:
        let s4 = 1.0
        if (u <= exitRatio) {
          s4 = 1.0
        } else {
          const uFlight = (u - exitRatio) / (1.0 - exitRatio)
          if (uFlight <= 0.65) {
            s4 = 1.0
          } else {
            const t4 = (uFlight - 0.65) / 0.35
            const ease4 = 0.5 * (1 - Math.cos(t4 * Math.PI))
            s4 = 1.0 - ease4
          }
        }
        this.setScene4Progress(s4, 'transitioning', 3)
      },
      onComplete: () => {
        this.scene5Phase = 'idle'
        this.scene4Phase = 'idle'
        this.portalSourceScene = 3
        this.portalTargetScene = 3
        this.setScene5Progress(0, 'idle', 4)
        this.setScene4Progress(0, 'idle', 3)
        this.setActiveScene(3)
        this.completeTransition()
        this.intendedTargetScene = undefined
      }
    })
  },

  triggerTransition(
    targetScene: 1 | 2 | 3 | 4 | 5,
    triggerMethod: 'scroll' | 'click' | 'gesture' | 'code' = 'click'
  ): boolean {
    // If opening Scene 5 via direct portal and it has already filled the screen (progress >= 0.92),
    // allow immediately triggering the next scene without waiting!
    const isOpeningScene5Filled =
      this.isTransitioning &&
      this.portalTargetScene === 5 &&
      this.portalPhase === 'opening' &&
      this.portalProgress >= 0.92

    if (isOpeningScene5Filled) {
      this.completeTransition()
      this.setActiveScene(5)
      this.portalPhase = 'idle'
      this.scene5Phase = 'idle'
    }

    if (!this.canTriggerTransition() || this.activeScene === targetScene) return false
    if (this.activeScene === 1 && targetScene === 2 && triggerMethod !== 'click') {
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 880
      if (isMobile && !this.isScene1TextComplete) {
        if (typeof this.requestScene2FromMobile === 'function') {
          this.requestScene2FromMobile()
        }
        return false
      }
    }

    trackEvent('scene_change', {
      from_scene: this.activeScene,
      to_scene: targetScene,
      method: triggerMethod,
    })
    this.setNavTargetScene(targetScene)

    // Route to Scene 5 (Rhythm Highway / Specs):
    if (targetScene === 5) {
      this.scene5TriggerMethod = triggerMethod
      this.setScene5ScrollProgress(0)
      this.scene5ScrollTarget = 0
      if (this.activeScene === 4) {
        this.triggerScene5Transition(5, undefined, undefined, triggerMethod)
        return true
      }
      if (this.activeScene === 3) {
        this.triggerScene3ToScene5()
        return true
      }
      // Direct transition from Scene 1 or 2 to Scene 5 via aperture portal:
      if (this.activeScene === 1 || this.activeScene === 2) {
        this.triggerDirectPortalToScene5(this.activeScene)
        return true
      }
    }

    // Return from Scene 5:
    if (this.activeScene === 5) {
      if (targetScene === 4) {
        this.triggerScene5Transition(4, undefined, 3.8)
        return true
      }
      if (targetScene === 3) {
        this.triggerScene5ToScene3(5.4)
        return true
      }
      // Direct return from Scene 5 to Scene 1 or 2 via closing aperture portal:
      if (targetScene === 2 || targetScene === 1) {
        this.triggerScene5ToDirectPortal(targetScene, 2.2)
        return true
      }
    }

    // Transition to Scene 4 (Ribbon Unspool & Immersion):
    if (targetScene === 4) {
      if (this.activeScene === 3) {
        this.intendedTargetScene = undefined
        this.setSuppressScene3Text(false)
        this.triggerScene4Transition(4)
        return true
      }

      // Transition from Scene 1 or 2 to Scene 4 without intermediate text flash:
      this.intendedTargetScene = 4
      this.setSuppressScene3Text(true)

      // Fast aperture expansion into Scene 3 (0.95s):
      this.triggerPortalTransition(3, () => {
        // Immediate camera immersion into Scene 4 (1.45s):
        this.triggerScene4Transition(4, () => {
          this.intendedTargetScene = undefined
          this.setSuppressScene3Text(false)
        }, 1.45)
      }, 0.95)
      return true
    }

    if (this.activeScene === 4) {
      if (targetScene === 3) {
        this.intendedTargetScene = undefined
        this.setSuppressScene3Text(false)
        this.triggerScene4Transition(3, undefined, 2.4)
        return true
      }

      // Direct return from Scene 4 to Scene 1 or 2 with reverse rotation:
      if (targetScene === 2 || targetScene === 1) {
        this.triggerScene4ToScene1or2(targetScene)
        return true
      }
    }

    // Transitions between Scene 2 (OLED Darkroom) and Scene 3 (Steam Library):
    if (this.activeScene === 2 && targetScene === 3) {
      this.triggerPortalTransition(3)
      return true
    }
    if (this.activeScene === 3 && targetScene === 2) {
      this.triggerPortalTransition(2)
      return true
    }

    // Transitions between Scene 1 (Hero Overview) and Scene 3 (Steam Library):
    if (this.activeScene === 1 && targetScene === 3) {
      this.triggerPortalTransition(3)
      return true
    }
    if (this.activeScene === 3 && targetScene === 1) {
      this.triggerPortalTransition(1)
      return true
    }

    this.isTransitioning = true

    const el = getScrollElement()
    if (el) {
      el.style.overflow = 'hidden'
    }

    // Shutter closing (1050ms)
    this.setShutterPhase('closing')

    setTimeout(() => {
      // Shutter closed impact (~790ms)
      this.setShutterPhase('closed')

      // Switch scene and teleport console behind closed shutter (1050ms)
      setTimeout(() => {
        if (targetScene === 2 || targetScene === 3) {
          this.setActiveScene(targetScene)
          this.darkroomProgress = targetScene === 2 ? 1 : 0
          this.darkroomMode = targetScene === 2
          this.snapSteamDeckToScene = true
          this.setPortalState('idle', 0, targetScene, targetScene)

          const targetP = targetScene === 3 ? 0.90 : 0.65
          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight
            el.scrollTop = maxScroll * targetP
            el.dispatchEvent(new Event('scroll'))
          }
          this.offset = targetP
        } else {
          this.setActiveScene(1)
          this.darkroomProgress = 0
          this.darkroomMode = false
          this.setPortalState('idle', 0, 1, 1)
          this.setPortalClipPath('polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)')
          this.snapSteamDeckToScene = true

          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight
            el.scrollTop = maxScroll * 0.28
            el.dispatchEvent(new Event('scroll'))
          }
          this.offset = 0.28
        }

        // Settle DOM and Three.js state behind closed shutter (200ms)
        setTimeout(() => {
          // Open shutter (1050ms)
          this.setShutterPhase('opening')

          setTimeout(() => {
            this.setShutterPhase(targetScene === 2 ? 'darkroom' : 'idle')
            this.completeTransition()
            if (el) {
              el.style.overflow = 'auto'
            }
          }, 1050)
        }, 200)
      }, 330)
    }, 720)

    return true
  },

  scrollTo: (prog: number) => {
    if (showcaseState.isTransitioning) return

    // Navigation routes from Scene 5 (Specs / Highway):
    if (showcaseState.activeScene === 5) {
      if (prog >= 0.82) {
        showcaseState.triggerTransition(4)
      } else if (prog >= 0.60) {
        showcaseState.triggerTransition(3)
      } else if (prog >= 0.40) {
        showcaseState.triggerTransition(2)
      } else {
        showcaseState.triggerTransition(1)
      }
      return
    }

    // Navigation routes from Scene 4 (Immersion):
    if (showcaseState.activeScene === 4) {
      if (prog >= 0.82) {
        showcaseState.triggerTransition(3)
      } else if (prog >= 0.50) {
        showcaseState.triggerTransition(2)
      } else {
        showcaseState.triggerTransition(1)
      }
      return
    }

    // Inter-scene scroll thresholds:
    if (prog >= 0.50 && showcaseState.activeScene === 1) {
      if (prog >= 0.82) {
        showcaseState.triggerPortalTransition(3)
      } else {
        showcaseState.triggerTransition(2)
      }
      return
    }
    if (prog < 0.50 && showcaseState.activeScene !== 1) {
      if (showcaseState.activeScene === 3) {
        showcaseState.triggerPortalTransition(1)
      } else {
        showcaseState.triggerTransition(1)
      }
      return
    }
    if (prog >= 0.82 && showcaseState.activeScene === 2) {
      showcaseState.triggerPortalTransition(3)
      return
    }
    if (prog <= 0.72 && showcaseState.activeScene === 3) {
      showcaseState.triggerPortalTransition(2)
      return
    }

    const el = getScrollElement()
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    const target = Math.max(0, maxScroll * prog)
    const proxy = { top: el.scrollTop }
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      top: target,
      duration: 3.0,
      ease: 'power2.inOut',
      onUpdate: () => {
        if (el) {
          el.scrollTop = proxy.top
          el.dispatchEvent(new Event('scroll'))
        }
      },
    })
  },
}

if (typeof window !== 'undefined') {
  window.__showcaseState = showcaseState
  window.showcaseState = showcaseState
  window.deckState = deckState
}
