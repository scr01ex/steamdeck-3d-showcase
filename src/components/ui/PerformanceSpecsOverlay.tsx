'use client'

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { showcaseState } from '../3d/deckState'
import { computeMechaPortalGeometry } from '@/lib/mechaPortalGeometry'

/**
 * Path to the rendered video for Scene 5 background.
 * Set to e.g. '/videos/performance.mp4' when a background video is available.
 */
const SCENE5_BACKGROUND_VIDEO_SRC = '/renders/steam_deck_exterior_valve_1080p.mp4'

/**
 * Calculates Scene 5 background video resume timestamp (7 segments of 4.0s, 28.0s total):
 * - First visit (hasBeenVisited === false or lastExitTime === null):
 *     - via scroll: starts from origin with fade transition (t = 0.0s)
 *     - via portal: starts at segment content past the fade (t = 0.75s)
 * - Subsequent visits (hasBeenVisited === true and lastExitTime !== null):
 *     - calculates previous exit segment: exitSceneIdx = floor(lastExitTime / 4.0) % 7
 *     - advances to next segment: targetSceneIdx = (exitSceneIdx + 1) % 7
 *     - via scroll: starts at the segment transition fade (t = targetSceneIdx * 4.0s)
 *     - via portal: starts past the transition fade (t = targetSceneIdx * 4.0 + 0.75s)
 */
function calculateScene5VideoResumeTime(
  lastExitTime: number | null,
  hasBeenVisited: boolean,
  isPortal: boolean
): number {
  const SCENE_DURATION = 4.0
  const TOTAL_SCENES = 7
  const TOTAL_DURATION = 28.0

  // Initial Scene 5 entrance:
  if (!hasBeenVisited || lastExitTime === null) {
    return isPortal ? 0.75 : 0.0
  }

  // Subsequent visit (advance to next segment after previous exit):
  const safeExitTime = Math.max(0, lastExitTime) % TOTAL_DURATION
  const exitSceneIdx = Math.floor(safeExitTime / SCENE_DURATION) % TOTAL_SCENES
  const nextSceneIdx = (exitSceneIdx + 1) % TOTAL_SCENES

  if (isPortal) {
    return (nextSceneIdx * SCENE_DURATION + 0.75) % TOTAL_DURATION
  } else {
    return (nextSceneIdx * SCENE_DURATION) % TOTAL_DURATION
  }
}

interface SpecMilestone {
  id: string
  indexStr: string
  category: string
  title: string
  description: string
}

const SPEC_MILESTONES: SpecMilestone[] = [
  {
    id: 'architecture',
    indexStr: '01',
    category: 'PROCESSOR & ARCHITECTURE',
    title: 'Custom 6nm AMD APU',
    description:
      'The custom AMD APU is die\u2011shrunk to TSMC\'s 6\u00A0nm process for superior efficiency, pairing a 4\u2011core, 8\u2011thread Zen\u00A02 CPU (up to 3.5\u00A0GHz) with 8 RDNA\u00A02 compute units in a 4–15\u00A0W envelope for cooler, longer\u00A0play\u00A0sessions.',
  },
  {
    id: 'thermals',
    indexStr: '02',
    category: 'THERMAL ARCHITECTURE',
    title: 'Thicker Fan & Redesigned Thermals',
    description:
      'A larger, thicker fan and upgraded heat pipe geometry move more air at lower RPMs. This keeps thermals in check while completely eliminating the high\u2011pitched whine of the original LCD\u00A0chassis.',
  },
  {
    id: 'power',
    indexStr: '03',
    category: 'BATTERY & CHARGING',
    title: '50Whr Battery & 45W Fast Charging',
    description:
      'A 50\u00A0Whr battery paired with the 6\u00A0nm APU extends runtime to 3–12\u00A0hours (30–50% longer than LCD). The included 45\u00A0W USB\u2011C PD power supply features a longer 2.5\u00A0m cable and charges from 20%\u00A0to\u00A080% in 45\u00A0minutes.',
  },
  {
    id: 'controls',
    indexStr: '04',
    category: 'CONTROLS & HAPTICS',
    title: 'Capacitive Thumbsticks & Precision Trackpads',
    description:
      'Full\u2011size analog sticks feature taller, grippier caps and integrated capacitive gyro sensors. Dual 32.5\u00A0mm haptic trackpads deliver crisp tactile clicks and 1:1 mouse precision in desktop\u00A0mode.',
  },
  {
    id: 'acoustics',
    indexStr: '05',
    category: 'AUDIO SUBSYSTEM',
    title: 'Enhanced Stereo Audio & Dual Mics',
    description:
      'Front\u2011firing stereo speakers are retuned for punchier bass and clearer soundstage separation. A dual\u2011microphone array provides beamforming noise cancellation, paired with a dedicated low\u2011latency 3.5\u00A0mm audio\u00A0jack.',
  },
  {
    id: 'wireless',
    indexStr: '06',
    category: 'WIRELESS & EXPANSION',
    title: 'Wi-Fi 6E Tri-Band & Dedicated Bluetooth 5.3',
    description:
      'Tri\u2011band Wi\u2011Fi\u00A06E unlocks the 6\u00A0GHz spectrum for up to 3× faster game downloads and lower latency. A dedicated secondary Bluetooth antenna supports wake\u2011from\u2011controller while docked, alongside a high\u2011speed UHS\u2011I microSD\u00A0slot.',
  },
  {
    id: 'steamos',
    indexStr: '07',
    category: 'SOFTWARE & OS',
    title: 'SteamOS 3 & Instant Suspend/Resume',
    description:
      'SteamOS runs thousands of Windows titles out of the box through Arch Linux and Proton. Tap the power button to instantly suspend and resume gameplay mid\u2011action, or switch to desktop mode for a full KDE\u00A0Linux\u00A0workstation.',
  },
]

export function PerformanceSpecsOverlay() {
  const [activeScene, setActiveScene] = useState<number>(showcaseState.activeScene)
  const [navTarget, setNavTarget] = useState<number>(showcaseState.navTargetScene || 1)
  const [scene5Prog, setScene5Prog] = useState<number>(showcaseState.scene5Progress)
  const [scene5Phase, setScene5Phase] = useState<'idle' | 'transitioning'>(showcaseState.scene5Phase)
  const [scene5Target, setScene5Target] = useState<4 | 5>(showcaseState.scene5TargetScene)
  const [_scrollProgress, setScrollProgress] = useState<number>(0)
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

  const [dims, setDims] = useState({ width: 1440, height: 900 })

  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const topLightRef = useRef<HTMLDivElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)

  // Virtual momentum scroll state
  const scrollTargetRef = useRef(0)
  const scrollCurrentRef = useRef(0)
  const maxScrollRef = useRef(2000)
  const animFrameRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartYRef = useRef(0)
  const dragStartXRef = useRef(0)
  const dragLastYRef = useRef(0)
  const dragLastTimeRef = useRef(0)
  const dragVelocityYRef = useRef(0)
  const dragStartScrollRef = useRef(0)
  const dragOverScrollYRef = useRef(0)
  const scrollUpAccRef = useRef(0)
  const scrollUpTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wasDirectPortalRef = useRef(false)
  const enteredViaPortalRef = useRef(false)
  const fadePauseTimerRef = useRef<NodeJS.Timeout | null>(null)
  const videoStartTimerRef = useRef<NodeJS.Timeout | null>(null)
  const prevEnteringRef = useRef(false)
  const [isVideoActive, setIsVideoActive] = useState(false)
  const isVideoActiveRef = useRef(false)

  // Responsive dimensions
  useEffect(() => {
    const updateDims = () => setDims({ width: window.innerWidth, height: window.innerHeight })
    updateDims()
    window.addEventListener('resize', updateDims)
    return () => window.removeEventListener('resize', updateDims)
  }, [])

  // Listen to scene changes and transition progress
  useEffect(() => {
    const unsubScene = showcaseState.onActiveSceneChange((scene) => {
      setActiveScene(scene)
      if (containerRef.current) {
        if (scene !== 5) {
          if (!showcaseState.isTransitioning || showcaseState.intendedTargetScene !== 5) {
            containerRef.current.style.display = 'none'
            containerRef.current.style.visibility = 'hidden'
            containerRef.current.style.clipPath = 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'
          }
        } else {
          containerRef.current.style.display = 'block'
          containerRef.current.style.visibility = 'visible'
        }
      }
    })
    const unsubS5 = showcaseState.onScene5Change((prog, phase, target) => {
      setScene5Prog(prog)
      setScene5Phase(phase)
      if (target) setScene5Target(target)
    })
    const unsubNav = showcaseState.onNavTargetChange((target) => {
      setNavTarget(target)
    })
    const unsubPortal = showcaseState.onPortalChange((data) => {
      setPortalState(data)
      if (containerRef.current) {
        const isDirect5ClosingNow =
          (data.targetScene === 1 || data.targetScene === 2 || showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2) &&
          (data.sourceScene === 5 || showcaseState.portalSourceScene === 5 || showcaseState.activeScene === 5)
        if (isDirect5ClosingNow && (data.progress <= 0.005 || data.phase === 'idle')) {
          containerRef.current.style.display = 'none'
          containerRef.current.style.visibility = 'hidden'
          containerRef.current.style.clipPath = 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'
        } else if (data.phase === 'closing' && data.progress <= 0.005) {
          containerRef.current.style.display = 'none'
          containerRef.current.style.visibility = 'hidden'
          containerRef.current.style.clipPath = 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'
        } else if (data.phase === 'opening' && (data.targetScene === 5 || showcaseState.portalTargetScene === 5)) {
          containerRef.current.style.display = 'block'
          containerRef.current.style.visibility = 'visible'
        }
      }
    })
    return () => {
      unsubScene()
      unsubS5()
      unsubNav()
      unsubPortal()
    }
  }, [])

  // Check if direct transition between Scene 1/2 and Scene 5 is active
  const isDirect5Transition = (
    (portalState.phase !== 'idle' || showcaseState.portalPhase !== 'idle') && (
      portalState.targetScene === 5 || portalState.sourceScene === 5 ||
      showcaseState.portalTargetScene === 5 || showcaseState.portalSourceScene === 5
    ) && (
      portalState.targetScene === 1 || portalState.targetScene === 2 ||
      portalState.sourceScene === 1 || portalState.sourceScene === 2 ||
      showcaseState.portalTargetScene === 1 || showcaseState.portalTargetScene === 2 ||
      showcaseState.portalSourceScene === 1 || showcaseState.portalSourceScene === 2
    )
  ) || (
    showcaseState.isTransitioning && (
      (showcaseState.activeScene === 5 && (navTarget === 1 || navTarget === 2 || showcaseState.intendedTargetScene === 1 || showcaseState.intendedTargetScene === 2)) ||
      ((activeScene === 1 || activeScene === 2) && (navTarget === 5 || showcaseState.intendedTargetScene === 5))
    )
  )

  const isDirect5Closing = isDirect5Transition && (
    portalState.phase === 'closing' ||
    showcaseState.portalPhase === 'closing' ||
    (showcaseState.activeScene === 5 && (navTarget === 1 || navTarget === 2 || showcaseState.intendedTargetScene === 1 || showcaseState.intendedTargetScene === 2))
  )
  const isDirect5Opening = isDirect5Transition && (
    portalState.phase === 'opening' ||
    showcaseState.portalPhase === 'opening' ||
    ((activeScene === 1 || activeScene === 2) && (navTarget === 5 || showcaseState.intendedTargetScene === 5))
  )
  
  // During direct portal closing, text stays inside shrinking aperture until aperture completely collapses into console slit (p <= 0.005):
  const isDirect5ExitGone = isDirect5Closing && (portalState.progress <= 0.005 || showcaseState.portalProgress <= 0.005)

  useEffect(() => {
    // Entering Scene 5 from any scene (direct portal from 1/2, or transition from 3/4):
    if (isDirect5Opening || (scene5Target === 5 && scene5Phase === 'transitioning')) {
      if (isDirect5Opening) {
        enteredViaPortalRef.current = true
      }
      scrollTargetRef.current = 0
      scrollCurrentRef.current = 0
      setScrollProgress(0)
      showcaseState.setScene5ScrollProgress(0)
      if (contentRef.current) {
        contentRef.current.style.transform = 'translate3d(0, 0px, 0)'
      }
      if (topLightRef.current) {
        topLightRef.current.style.transform = 'translate3d(0, 0px, 0)'
        if (isDirect5Opening) {
          topLightRef.current.style.opacity = '1'
        }
      }
    }

    // Direct portal exit finished collapsing into console:
    if (isDirect5ExitGone) {
      scrollTargetRef.current = 0
      scrollCurrentRef.current = 0
      setScrollProgress(0)
      showcaseState.setScene5ScrollProgress(0)
      if (contentRef.current) {
        contentRef.current.style.transform = 'translate3d(0, 0px, 0)'
      }
      if (topLightRef.current) {
        topLightRef.current.style.transform = 'translate3d(0, 0px, 0)'
      }
    }

    // Settled on another scene:
    if (activeScene !== 5 && !isDirect5Transition) {
      enteredViaPortalRef.current = false
      scrollTargetRef.current = 0
      scrollCurrentRef.current = 0
      setScrollProgress(0)
      showcaseState.setScene5ScrollProgress(0)
      if (contentRef.current) {
        contentRef.current.style.transform = 'translate3d(0, 0px, 0)'
      }
      if (topLightRef.current) {
        topLightRef.current.style.transform = 'translate3d(0, 0px, 0)'
      }
    }
  }, [isDirect5Opening, scene5Target, scene5Phase, isDirect5ExitGone, activeScene, isDirect5Transition])

  // Non-portal exit (Scene 5 -> Scene 4 or 3): wait 550ms for text to fully fade to opacity 0,
  // then cleanly reset scroll to 0px in the background so next entry starts at Milestone 01 (0px):
  useEffect(() => {
    if (navTarget !== 5 && !isDirect5Transition) {
      const t = setTimeout(() => {
        scrollTargetRef.current = 0
        scrollCurrentRef.current = 0
        setScrollProgress(0)
        showcaseState.setScene5ScrollProgress(0)
        if (contentRef.current) {
          contentRef.current.style.transform = 'translate3d(0, 0px, 0)'
        }
      }, 550)
      return () => clearTimeout(t)
    }
  }, [navTarget, isDirect5Transition])

  // Choreographed entrance & exit states:
  const isNavigatingAway = (navTarget !== 5 && !isDirect5Transition) || isDirect5ExitGone
  const isEnteringScene5 = !isNavigatingAway && scene5Target === 5 && scene5Prog >= 0.958
  const isDirect5OpeningReady = isDirect5Transition && portalState.phase === 'opening' && (portalState.progress >= 0.92 || showcaseState.portalProgress >= 0.92)
  const isSettledInScene5 = !isNavigatingAway && (
    (activeScene === 5 && (scene5Phase === 'idle' || !showcaseState.isTransitioning || isDirect5Closing)) ||
    isEnteringScene5 ||
    isDirect5OpeningReady
  )
  const isRevealed = !isNavigatingAway && (isSettledInScene5 || isEnteringScene5 || isDirect5Closing)
  const isContentVisible = isRevealed || isDirect5Transition

  // Text is present from the VERY FIRST FRAME of direct portal opening (not popping in midway!),
  // and stays inside the mecha aperture as it blooms or collapses:
  const isTextVisible = !isDirect5ExitGone && !isNavigatingAway && (
    (activeScene === 5 && isRevealed) || isDirect5Opening || (isDirect5Closing && !isDirect5ExitGone)
  )
  const isDirectOpeningMode = isDirect5Opening

  // Pure settled state in Scene 5: only when truly settled on Scene 5 without transitioning away
  const isSettledFullScene5 =
    activeScene === 5 &&
    showcaseState.activeScene === 5 &&
    !isDirect5Transition &&
    portalState.phase === 'idle' &&
    showcaseState.portalPhase === 'idle' &&
    !showcaseState.isTransitioning &&
    (navTarget === 5 || navTarget === undefined) &&
    (showcaseState.intendedTargetScene === undefined || showcaseState.intendedTargetScene === 5) &&
    !isDirect5ExitGone

  // Check if non-portal exit from Scene 5 (5 -> 3 or 5 -> 4) is active:
  const isNonPortalExit5 =
    !isDirect5Transition &&
    (activeScene === 5 || showcaseState.activeScene === 5) &&
    (navTarget === 3 || navTarget === 4 || showcaseState.navTargetScene === 3 || showcaseState.navTargetScene === 4) &&
    (scene5Phase === 'transitioning' || showcaseState.scene5Phase === 'transitioning' || showcaseState.isTransitioning) &&
    (scene5Prog > 0.001 || showcaseState.scene5Progress > 0.001)

  const isOverlayMounted = !isDirect5ExitGone && (
    isSettledFullScene5 ||
    isNonPortalExit5 ||
    (isDirect5Transition && !isDirect5ExitGone) ||
    (scene5Phase === 'transitioning' && scene5Target === 5)
  ) && (activeScene === 5 || isDirect5Transition || isNonPortalExit5 || (scene5Phase === 'transitioning' && scene5Target === 5))

  // Compute Avant-Garde Stepped Mecha-Chassis Polygon for Scene 4 Portal
  const p = isDirect5Transition ? portalState.progress : (activeScene === 5 ? 1.0 : 0.0)

  const { cssPolygon, svgPoints, borderOpacity, markOpacity, cornerMarks } = useMemo(() => {
    if (!isDirect5Transition) {
      return {
        cssPolygon: (isSettledFullScene5 || isNonPortalExit5) ? 'none' : 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)',
        svgPoints: '',
        borderOpacity: 0,
        markOpacity: 0,
        cornerMarks: [] as [number, number][],
      }
    }
    return computeMechaPortalGeometry(p, portalState.phase, dims.width, dims.height)
  }, [isDirect5Transition, isSettledFullScene5, isNonPortalExit5, p, portalState.phase, dims.width, dims.height])

  const effectiveClipPath = isDirect5ExitGone || (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5)
    ? 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'
    : (isDirect5Transition ? cssPolygon : ((isSettledFullScene5 || isNonPortalExit5) ? 'none' : 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)'))

  // Synchronize the stepped mecha-chassis polygon with the global portal clip-path so headers and UI can be recolored cleanly:
  useEffect(() => {
    if (isDirect5Transition && !isDirect5ExitGone) {
      showcaseState.setPortalClipPath(cssPolygon)
    } else if (isSettledFullScene5 || isNonPortalExit5) {
      showcaseState.setPortalClipPath('none')
    } else {
      showcaseState.setPortalClipPath('polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)')
    }
  }, [isDirect5Transition, isDirect5ExitGone, isSettledFullScene5, isNonPortalExit5, cssPolygon])

  // Calculate max scroll based on content height so footer sits elegantly flush at the bottom
  useEffect(() => {
    const updateMaxScroll = () => {
      if (contentRef.current && containerRef.current) {
        const contentH = contentRef.current.offsetHeight
        const viewH = containerRef.current.offsetHeight
        maxScrollRef.current = Math.max(0, contentH - viewH)
      }
    }
    updateMaxScroll()
    window.addEventListener('resize', updateMaxScroll)
    return () => window.removeEventListener('resize', updateMaxScroll)
  }, [isRevealed, activeScene])

  // Controlled video playback & exact frame preservation:
  // - Plays continuously while Scene 5 is visible (including during direct portal or 700ms fade-out).
  // - Pauses when the transition completes and Scene 5 is no longer visible.
  // - Resumes seamlessly from the previous timestamp upon return.
  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return
    video.defaultMuted = true
    video.muted = true

    const isEnteringScene5Now = isRevealed || isDirect5Transition

    if (isEnteringScene5Now) {
      // Scene 5 active or entering:
      if (fadePauseTimerRef.current) {
        clearTimeout(fadePauseTimerRef.current)
        fadePauseTimerRef.current = null
      }

      const isPortal = isDirect5Transition || showcaseState.scene5TriggerMethod === 'click'

      // Rising edge of entering Scene 5 (via direct portal opening or manual scrolling):
      if (!prevEnteringRef.current) {
        prevEnteringRef.current = true
        const targetResumeTime = calculateScene5VideoResumeTime(
          showcaseState.scene5LastExitTime,
          showcaseState.scene5HasBeenVisited,
          isPortal
        )
        try {
          if (video.readyState >= 1) {
            video.currentTime = targetResumeTime
          }
          showcaseState.scene5VideoTime = targetResumeTime
        } catch (_) {}

        // Delay video start slightly after text sequence begins for smooth presentation
        if (!video.paused) {
          video.pause()
        }
        isVideoActiveRef.current = false
        setIsVideoActive(false)

        if (videoStartTimerRef.current) {
          clearTimeout(videoStartTimerRef.current)
        }
        const delayMs = isPortal ? 350 : 450
        videoStartTimerRef.current = setTimeout(() => {
          isVideoActiveRef.current = true
          setIsVideoActive(true)
          if (bgVideoRef.current) {
            try {
              if (Math.abs(bgVideoRef.current.currentTime - targetResumeTime) > 1.0) {
                bgVideoRef.current.currentTime = targetResumeTime
              }
            } catch (_) {}
            if (bgVideoRef.current.paused) {
              bgVideoRef.current.play().catch(() => {})
            }
          }
        }, delayMs)
      } else if (isVideoActiveRef.current && video.paused) {
        video.play().catch(() => {})
      }

      wasDirectPortalRef.current = isDirect5Transition
    } else {
      // Scene 5 exiting or exited:
      if (prevEnteringRef.current) {
        prevEnteringRef.current = false
        if (videoStartTimerRef.current) {
          clearTimeout(videoStartTimerRef.current)
          videoStartTimerRef.current = null
        }
        isVideoActiveRef.current = false
        setIsVideoActive(false)

        if (wasDirectPortalRef.current) {
          // Direct portal (Scene 5 -> 1 or 2) just finished closing to 0 in the console center:
          video.pause()
          showcaseState.scene5VideoTime = video.currentTime
          showcaseState.scene5LastExitTime = video.currentTime
          showcaseState.scene5HasBeenVisited = true
          wasDirectPortalRef.current = false
        } else {
          // Fallback: capture current frame immediately upon exit trigger:
          if (video.currentTime > 0) {
            showcaseState.scene5VideoTime = video.currentTime
            showcaseState.scene5LastExitTime = video.currentTime
            showcaseState.scene5HasBeenVisited = true
          }
          // Scroll / menu exit (Scene 5 -> 4 or 3):
          // Exactly when the 700ms fade-out completes (opacity reaches 0), pause and remember the exit frame!
          if (fadePauseTimerRef.current) clearTimeout(fadePauseTimerRef.current)
          fadePauseTimerRef.current = setTimeout(() => {
            if (bgVideoRef.current) {
              bgVideoRef.current.pause()
              showcaseState.scene5VideoTime = bgVideoRef.current.currentTime
              showcaseState.scene5LastExitTime = bgVideoRef.current.currentTime
              showcaseState.scene5HasBeenVisited = true
            }
            fadePauseTimerRef.current = null
          }, 700)
        }
      }
    }

    return () => {
      if (fadePauseTimerRef.current) {
        clearTimeout(fadePauseTimerRef.current)
        fadePauseTimerRef.current = null
      }
      if (videoStartTimerRef.current) {
        clearTimeout(videoStartTimerRef.current)
        videoStartTimerRef.current = null
      }
    }
  }, [isRevealed, isDirect5Transition])

  // Smooth momentum scroll animation loop
  useEffect(() => {
    if (!isRevealed) {
      scrollTargetRef.current = 0
      scrollCurrentRef.current = 0
      setScrollProgress(0)
      showcaseState.setScene5ScrollProgress(0)
      if (topLightRef.current) {
        topLightRef.current.style.transition = 'opacity 700ms ease-out, transform 700ms ease-out'
        topLightRef.current.style.opacity = '0'
        topLightRef.current.style.transform = 'translate3d(0, 0, 0)'
      }
      if (isDirect5ExitGone || (activeScene !== 5 && !isDirect5Transition) || (scene5Target === 5 && !isSettledInScene5)) {
        if (contentRef.current) {
          contentRef.current.style.transform = 'translate3d(0, 0px, 0)'
        }
      }
      if (bgVideoRef.current) {
        bgVideoRef.current.style.opacity = isVideoActiveRef.current ? '0.85' : '0'
      }
      return
    }

    if (topLightRef.current) {
      topLightRef.current.style.transition = 'opacity 1000ms ease-out, transform 1000ms ease-out'
      topLightRef.current.style.opacity = '1'
      topLightRef.current.style.transform = 'translate3d(0, 0, 0)'
    }

    let running = true
    const loop = () => {
      if (!running) return

      // Smooth lerp towards target with responsive physical damping
      const diff = scrollTargetRef.current - scrollCurrentRef.current
      if (Math.abs(diff) > 0.08) {
        const lerpFactor = isDraggingRef.current ? 0.35 : 0.085
        scrollCurrentRef.current += diff * lerpFactor
      } else {
        scrollCurrentRef.current = scrollTargetRef.current
      }

      const normProgress = maxScrollRef.current > 0 ? scrollCurrentRef.current / maxScrollRef.current : 0
      const clampedProg = Math.max(0, Math.min(1, normProgress))
      setScrollProgress(clampedProg)
      showcaseState.setScene5ScrollProgress(clampedProg)

      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(0, -${scrollCurrentRef.current.toFixed(2)}px, 0)`
      }

      // Key light pinned to top of scene, smoothly fading on scroll down:
      if (topLightRef.current) {
        if (Math.abs(scrollCurrentRef.current) > 0.5) {
          topLightRef.current.style.transition = 'none'
        }
        const scrollY = scrollCurrentRef.current
        topLightRef.current.style.transform = `translate3d(0, -${scrollY.toFixed(2)}px, 0)`
        const scrollFade = Math.max(0, Math.min(1, 1 - scrollY / 420))
        const smoothFade = scrollFade * scrollFade * (3 - 2 * scrollFade)
        topLightRef.current.style.opacity = smoothFade.toFixed(4)
      }

      // Synchronize video opacity with visibility state
      if (bgVideoRef.current) {
        bgVideoRef.current.style.opacity = isVideoActiveRef.current ? '0.85' : '0'
        if (isVideoActiveRef.current && bgVideoRef.current.paused && isRevealed) {
          bgVideoRef.current.defaultMuted = true
          bgVideoRef.current.muted = true
          const playPromise = bgVideoRef.current.play()
          if (playPromise !== undefined) {
            playPromise.catch(() => {})
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isRevealed])

  // Connect impulse callback into deckState so external wheel/touch events can drive it
  useEffect(() => {
    showcaseState.addScene5ScrollImpulse = (deltaY: number) => {
      const isScrollReady = !isNavigatingAway && (
        (activeScene === 5 && (!showcaseState.isTransitioning || scene5Phase === 'idle')) ||
        isDirect5OpeningReady
      )
      if (!isScrollReady) return

      // If at top and scrolling up, accumulate impulse to return to Scene 4
      if (scrollCurrentRef.current <= 5 && deltaY < 0) {
        scrollUpAccRef.current += deltaY
        if (scrollUpTimerRef.current) clearTimeout(scrollUpTimerRef.current)
        scrollUpTimerRef.current = setTimeout(() => {
          scrollUpAccRef.current = 0
        }, 280)

        if (scrollUpAccRef.current <= -45) {
          scrollUpAccRef.current = 0
          showcaseState.triggerTransition(4)
        }
        return
      }

      // Smoothly advance scroll target
      scrollTargetRef.current = Math.max(0, Math.min(maxScrollRef.current, scrollTargetRef.current + deltaY))
    }

    return () => {
      showcaseState.addScene5ScrollImpulse = null
    }
  }, [activeScene, isNavigatingAway, scene5Phase, isDirect5OpeningReady])

  // Wheel listener directly on container
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const isScrollReady = !isNavigatingAway && (
        (activeScene === 5 && (!showcaseState.isTransitioning || scene5Phase === 'idle')) ||
        isDirect5OpeningReady
      )
      if (!isScrollReady) return
      e.stopPropagation()
      e.preventDefault()

      if (showcaseState.addScene5ScrollImpulse) {
        showcaseState.addScene5ScrollImpulse(e.deltaY * 0.95)
      }
    },
    [activeScene, isNavigatingAway, scene5Phase, isDirect5OpeningReady]
  )

  // Touch drag support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    const isScrollReady = !isNavigatingAway && (
      (activeScene === 5 && (!showcaseState.isTransitioning || scene5Phase === 'idle')) ||
      isDirect5OpeningReady
    )
    if (!isScrollReady) return
    isDraggingRef.current = true
    const clientY = e.touches[0].clientY
    const clientX = e.touches[0].clientX
    dragStartYRef.current = clientY
    dragStartXRef.current = clientX
    dragLastYRef.current = clientY
    dragLastTimeRef.current = performance.now()
    dragVelocityYRef.current = 0
    scrollTargetRef.current = scrollCurrentRef.current
    dragStartScrollRef.current = scrollCurrentRef.current
    dragOverScrollYRef.current = 0
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return
    const clientY = e.touches[0].clientY
    const clientX = e.touches[0].clientX
    const now = performance.now()
    const dt = Math.max(1, now - dragLastTimeRef.current)
    const stepDy = clientY - dragLastYRef.current

    const instV = stepDy / (dt / 1000)
    dragVelocityYRef.current = dragVelocityYRef.current * 0.35 + instV * 0.65

    dragLastYRef.current = clientY
    dragLastTimeRef.current = now

    const diffX = Math.abs(clientX - dragStartXRef.current)
    const diffY = Math.abs(clientY - dragStartYRef.current)
    if (diffX > diffY + 30 && scrollTargetRef.current === 0) {
      return
    }

    const totalDiff = dragStartYRef.current - clientY
    const newTarget = dragStartScrollRef.current + totalDiff

    if (newTarget < 0) {
      scrollTargetRef.current = Math.max(-60, newTarget * 0.35)
      dragOverScrollYRef.current = -newTarget
    } else {
      scrollTargetRef.current = Math.min(maxScrollRef.current, newTarget)
      dragOverScrollYRef.current = 0
    }
  }

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false

    const isScrollReady = !isNavigatingAway && (
      (activeScene === 5 && (!showcaseState.isTransitioning || scene5Phase === 'idle')) ||
      isDirect5OpeningReady
    )
    if (!isScrollReady) {
      if (scrollTargetRef.current < 0) scrollTargetRef.current = 0
      return
    }

    const pullDownDistance = dragLastYRef.current - dragStartYRef.current
    const wasNearTop = dragStartScrollRef.current <= 20 || scrollCurrentRef.current <= 5

    const isDeliberatePull = pullDownDistance >= 45 || dragOverScrollYRef.current >= 40
    const isQuickFlick = pullDownDistance >= 25 && (performance.now() - dragLastTimeRef.current < 90)

    if (wasNearTop && (isDeliberatePull || isQuickFlick)) {
      scrollTargetRef.current = 0
      showcaseState.triggerTransition(4)
      return
    }

    if (scrollTargetRef.current < 0) {
      scrollTargetRef.current = 0
      return
    }

    const timeSinceMove = performance.now() - dragLastTimeRef.current
    if (timeSinceMove < 100 && Math.abs(dragVelocityYRef.current) > 70) {
      const momentum = -dragVelocityYRef.current * 0.55
      const clampedMomentum = Math.max(-1200, Math.min(1200, momentum))
      scrollTargetRef.current = Math.max(0, Math.min(maxScrollRef.current, scrollTargetRef.current + clampedMomentum))
    }
  }

  const handleTouchCancel = () => {
    isDraggingRef.current = false
    if (scrollTargetRef.current < 0) {
      scrollTargetRef.current = 0
    }
  }

  return (
    <>
      <div
        id="scene5-specs-container"
        ref={containerRef}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className={`fixed inset-0 z-40 overflow-hidden select-none cursor-default ${
          isSettledInScene5 ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        style={{
          display: isOverlayMounted ? 'block' : 'none',
          visibility: isOverlayMounted ? 'visible' : 'hidden',
          clipPath: effectiveClipPath,
          WebkitClipPath: effectiveClipPath,
          opacity: isDirect5ExitGone || (activeScene !== 5 && !isDirect5Transition) ? 0 : 1,
          background: isDirect5Transition ? '#050505' : 'transparent',
          WebkitFontSmoothing: 'antialiased',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        {/* 1. Background Video Layer (Kept actively playing with opacity during direct portal transition and when revealed) */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none z-0"
          style={{
            opacity: isNavigatingAway && !isDirect5Transition ? 0 : (isContentVisible ? 1 : 0),
            transition: isDirect5Transition
              ? 'none'
              : (isNavigatingAway
                ? 'opacity 700ms ease-out'
                : isRevealed
                ? 'opacity 1200ms ease-out'
                : 'opacity 700ms ease-out'),
          }}
        >
          <div className="w-full h-full bg-[#050505] relative">
            {SCENE5_BACKGROUND_VIDEO_SRC && (
              <video
                ref={bgVideoRef}
                src={SCENE5_BACKGROUND_VIDEO_SRC}
                loop
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  e.currentTarget.muted = true
                  const isPortal = isDirect5Transition || showcaseState.scene5TriggerMethod === 'click'
                  const resumeTime = calculateScene5VideoResumeTime(
                    showcaseState.scene5LastExitTime,
                    showcaseState.scene5HasBeenVisited,
                    isPortal
                  )
                  try {
                    e.currentTarget.currentTime = resumeTime
                  } catch (_) {}
                  if (isVideoActiveRef.current && (isRevealed || isDirect5Transition)) {
                    e.currentTarget.play().catch(() => {})
                  }
                }}
                onCanPlay={(e) => {
                  if (isVideoActiveRef.current && (isRevealed || isDirect5Transition)) {
                    e.currentTarget.play().catch(() => {})
                  }
                }}
                onTimeUpdate={(e) => {
                  if (e.currentTarget.currentTime > 0) {
                    showcaseState.scene5VideoTime = e.currentTarget.currentTime
                    showcaseState.scene5LastExitTime = e.currentTarget.currentTime
                  }
                }}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none will-change-opacity"
                style={{
                  opacity: isVideoActive ? 0.85 : 0,
                  transition: 'opacity 700ms ease-out',
                }}
              />
            )}
            {/* Ultra-smooth architectural top light */}
            <div
              ref={topLightRef}
              className="absolute top-0 left-0 right-0 h-[800px] pointer-events-none overflow-hidden will-change-transform will-change-opacity"
              style={{
                transform: 'translate3d(0, 0, 0)',
                opacity: isTextVisible ? 1 : 0,
                transition: isDirectOpeningMode
                  ? 'none'
                  : (isRevealed
                    ? 'opacity 1000ms ease-out, transform 1000ms ease-out'
                    : 'opacity 700ms ease-out, transform 700ms ease-out'),
              }}
            >
              {/* Silky smooth multi-stop radial light from top-center */}
              <div
                className="absolute -top-20 left-1/2 -translate-x-1/2 w-[130%] h-[850px] pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse 100% 70% at 50% 0%, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.046) 8%, rgba(255, 255, 255, 0.038) 18%, rgba(255, 255, 255, 0.028) 30%, rgba(255, 255, 255, 0.019) 42%, rgba(255, 255, 255, 0.012) 55%, rgba(255, 255, 255, 0.006) 70%, rgba(255, 255, 255, 0.002) 84%, rgba(255, 255, 255, 0) 100%)',
                }}
              />
            </div>
            {/* Atmospheric vignette so text has maximum clarity */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(5,5,5,0.1) 0%, rgba(5,5,5,0.55) 75%, rgba(5,5,5,0.85) 100%)',
              }}
            />
          </div>
      </div>


      {/* 4. Scrolling Content: Alternating Left / Right Floating Specs */}
      <div
        ref={contentRef}
        className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 md:px-16 lg:px-20 pb-0 will-change-transform"
        style={{
          WebkitFontSmoothing: 'antialiased',
          transform: 'translate3d(0, 0px, 0)',
          backfaceVisibility: 'hidden',
          opacity: isDirect5ExitGone || (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5) ? 0 : 1,
        }}
      >
        {/* Milestones container with integrated central roadmap line terminating cleanly at Milestone 07 */}
        <div className="milestones-track relative pt-28 md:pt-32 pb-8 md:pb-12">
          {/* Central Vertical Roadmap Track: draws smoothly from top through all milestones and extends down to meet the footer border */}
          <div
            className="absolute top-0 bottom-0 left-[32px] md:left-1/2 w-[1px] bg-white/20 origin-top pointer-events-none will-change-transform will-change-opacity"
            style={{
              transform: isTextVisible ? 'scaleY(1)' : 'scaleY(0)',
              opacity: isTextVisible ? 1 : 0,
              transition: isDirectOpeningMode
                ? 'none'
                : (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5
                  ? 'none'
                  : (isRevealed
                    ? 'transform 1300ms cubic-bezier(0.16, 1, 0.3, 1) 40ms, opacity 1000ms cubic-bezier(0.16, 1, 0.3, 1) 40ms'
                    : 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1) 80ms, opacity 520ms cubic-bezier(0.4, 0, 0.2, 1) 80ms')),
            }}
          />
          {SPEC_MILESTONES.map((spec, index) => {
          const isLeft = index % 2 === 0
          // Staggered cascade for forward entrance (top-to-bottom):
          const forwardDelay = 60 + index * 120

          // Cinematic reverse exit cascade (bottom-to-top) matching entrance speed:
          const maxCascadeIdx = 3
          const clampedIdx = Math.min(index, maxCascadeIdx)
          const reverseDelay = (maxCascadeIdx - clampedIdx) * 70

          return (
            <div
              key={spec.id}
              className="spec-milestone-row relative my-14 md:my-18 flex flex-col md:flex-row items-start"
            >
              {/* Central anchor node on the roadmap track */}
              <div
                className="absolute left-[32px] md:left-1/2 top-3 z-20 flex items-center justify-center pointer-events-none will-change-transform will-change-opacity"
                style={{
                  transform: 'translateX(-50%)',
                  opacity: isTextVisible ? 1 : 0,
                  transition: isDirectOpeningMode
                    ? 'none'
                    : (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5
                      ? 'none'
                      : (isRevealed
                        ? `opacity 700ms ease-out ${forwardDelay + 60}ms`
                        : `opacity 500ms cubic-bezier(0.4, 0, 0.2, 1) ${reverseDelay}ms`)),
                }}
              >
                <div
                  className="w-2 h-2 bg-[#050505] border border-white/40 will-change-transform"
                  style={{
                    transform: isTextVisible ? 'rotate(45deg) scale(1)' : 'rotate(45deg) scale(0)',
                    transition: isDirectOpeningMode
                      ? 'none'
                      : (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5
                        ? 'none'
                        : (isRevealed
                          ? `transform 700ms ease-out ${forwardDelay + 60}ms`
                          : `transform 500ms cubic-bezier(0.4, 0, 0.2, 1) ${reverseDelay}ms`)),
                  }}
                />
              </div>

              {/* Connecting horizontal tick from center line to content */}
              <div
                className={`hidden md:block absolute top-4 h-[1px] pointer-events-none will-change-transform will-change-opacity ${
                  isLeft
                    ? 'right-1/2 mr-3 w-8 bg-white/20 origin-right'
                    : 'left-1/2 ml-3 w-8 bg-white/20 origin-left'
                }`}
                style={{
                  transform: isTextVisible ? 'scaleX(1)' : 'scaleX(0)',
                  opacity: isTextVisible ? 1 : 0,
                  transition: isDirectOpeningMode
                    ? 'none'
                    : (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5
                      ? 'none'
                      : (isRevealed
                        ? `transform 700ms ease-out ${forwardDelay + 100}ms, opacity 700ms ease-out ${forwardDelay + 100}ms`
                        : `transform 500ms cubic-bezier(0.4, 0, 0.2, 1) ${reverseDelay}ms, opacity 500ms cubic-bezier(0.4, 0, 0.2, 1) ${reverseDelay}ms`)),
                }}
              />

              {/* Spec Item Content Block */}
              <div
                className={`w-full md:w-[42%] pl-14 md:pl-0 ${
                  isLeft
                    ? 'md:mr-auto md:text-right md:pr-12 lg:pr-20'
                    : 'md:ml-auto md:text-left md:pl-12 lg:pl-20'
                }`}
                style={{
                  opacity: isTextVisible ? 0.82 : 0,
                  transform: isTextVisible ? 'translate3d(0, 0px, 0)' : 'translate3d(0, 36px, 0)',
                  filter: isTextVisible ? 'blur(0px)' : 'blur(8px)',
                  transition: isDirectOpeningMode
                    ? 'none'
                    : (activeScene !== 5 && !isDirect5Transition && !isNonPortalExit5
                      ? 'none'
                      : (isRevealed
                        ? `transform 1300ms cubic-bezier(0.16, 1, 0.3, 1) ${forwardDelay}ms, opacity 1000ms cubic-bezier(0.16, 1, 0.3, 1) ${forwardDelay}ms, filter 1000ms ease-out ${forwardDelay}ms`
                        : `transform 600ms cubic-bezier(0.4, 0, 0.2, 1) ${reverseDelay}ms, opacity 520ms cubic-bezier(0.4, 0, 0.2, 1) ${reverseDelay}ms, filter 520ms ease-out ${reverseDelay}ms`)),
                  willChange: 'transform, opacity, filter',
                  WebkitFontSmoothing: 'antialiased',
                }}
              >
                {/* Milestone Index & Category: Non-selectable with default pointer arrow */}
                <div
                  className={`flex items-center space-x-2 font-mono text-[11px] tracking-widest uppercase mb-2 select-none cursor-default ${
                    isLeft ? 'md:justify-end' : 'md:justify-start'
                  } text-neutral-400`}
                >
                  <span className="text-white/30 tabular-nums select-none cursor-default">{spec.indexStr} {'//'}</span>
                  <span className="select-none cursor-default">{spec.category}</span>
                </div>

                {/* Refined Headline: Non-selectable with default pointer arrow */}
                <h3 className="text-base md:text-lg font-medium tracking-normal text-neutral-100 mb-2.5 leading-snug text-balance select-none cursor-default">
                  {spec.title}
                </h3>

                {/* Subtext Description: Non-selectable with default pointer arrow */}
                <p 
                  className="text-xs md:text-[14px] text-neutral-400 font-normal leading-relaxed text-pretty select-none cursor-default"
                  style={{ hyphens: 'none', WebkitHyphens: 'none' }}
                >
                  {spec.description}
                </p>
              </div>
            </div>
          )
        })}
        </div>

        {/* 5. Pure Black Legal Bar & Developer Contacts Footer */}
        <footer
          className="w-screen relative left-1/2 -translate-x-1/2 bg-[#000000] border-t border-white/20 px-6 sm:px-12 md:px-16 lg:px-20 pt-8 pb-20 sm:pb-8 z-30 pointer-events-auto will-change-opacity select-none cursor-default"
          style={{
            opacity: isTextVisible ? 1 : 0,
            transition: isDirectOpeningMode
              ? 'none'
              : (activeScene !== 5 && !isDirect5Transition
                ? 'none'
                : (isRevealed ? 'opacity 800ms ease-out 900ms' : 'opacity 500ms ease-out')),
          }}
        >

          <div className="max-w-7xl mx-auto relative z-10">
            {/* Valve Legal & Trademark Notice */}
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 font-mono text-[9px] sm:text-[10px] tracking-[0.22em] text-white/50 uppercase mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                <span>LEGAL NOTICE & DISCLAIMER</span>
              </div>
              <p className="text-xs sm:text-[13px] text-neutral-300 font-normal leading-relaxed mb-3 text-pretty">
                This project is an independent 3D showcase and interactive design archive. It is{' '}
                <strong className="text-white font-medium">
                  not affiliated with, endorsed by, sponsored by, or associated with Valve Corporation
                </strong>
                .
              </p>
              <p className="text-[11px] sm:text-[12px] text-neutral-400 font-normal leading-relaxed text-pretty">
                Valve, the Valve logo, Steam, the Steam logo, SteamOS, and Steam Deck are trademarks and/or registered
                trademarks of Valve Corporation in the U.S. and/or other countries. All other brand names, game titles,
                artwork, and associated imagery are trademarks and copyright of their respective owners.
              </p>
            </div>
          </div>

          {/* Sub-bar */}
          <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[9px] text-neutral-400 tracking-widest uppercase relative z-10">
            <div>STEAM DECK OLED // 3D INTERACTIVE ARCHIVE</div>
            <div className="flex items-center gap-3">
              <span>ENGINEERED BY MAKSIM YALETSKI</span>
              <span className="w-px h-3 bg-white/20" aria-hidden="true" />
              <div className="flex items-center gap-2">
                {/* Telegram Link */}
                <a
                  href="https://t.me/scr01ex"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Telegram: Maksim Yaletski"
                  className="text-neutral-400 hover:text-white transition-colors duration-150 p-0.5 cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.432z" />
                  </svg>
                </a>

                {/* GitHub Link */}
                <a
                  href="https://github.com/scr01ex"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub: Maksim Yaletski"
                  className="text-neutral-400 hover:text-white transition-colors duration-150 p-0.5 cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>

      {/* 2. Avant-Garde Stepped Mecha-Chassis Framing for Scene 4 Portal */}
      {isDirect5Transition && borderOpacity > 0.005 && (() => {
        const isScene1Context = 
          portalState.sourceScene === 1 || portalState.targetScene === 1 ||
          showcaseState.portalSourceScene === 1 || showcaseState.portalTargetScene === 1 ||
          activeScene === 1

        const isDarkSource = !isScene1Context
        const strokeColor = isDarkSource ? 'rgba(255, 255, 255, 0.88)' : 'rgba(0, 0, 0, 0.78)'
        const crosshairColor = isDarkSource ? '#ffffff' : '#000000'

        return (
          <div className="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden">
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              width={dims.width}
              height={dims.height}
              viewBox={`0 0 ${dims.width} ${dims.height}`}
              style={{
                filter: !isDarkSource ? 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.12))' : undefined,
              }}
            >
              {/* Stepped Mecha-Chassis Contour */}
              <polygon
                points={svgPoints}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.5"
                opacity={borderOpacity}
              />

              {/* Precision Corner Crosshairs on Step Chamfer Vertices */}
              {markOpacity > 0.02 && cornerMarks.map(([mx, my], idx) => (
                <g key={idx} opacity={borderOpacity * markOpacity}>
                  <circle cx={mx} cy={my} r={2} fill={crosshairColor} />
                  <line x1={mx - 6} y1={my} x2={mx + 6} y2={my} stroke={crosshairColor} strokeWidth="1.2" />
                  <line x1={mx} y1={my - 6} x2={mx} y2={my + 6} stroke={crosshairColor} strokeWidth="1.2" />
                </g>
              ))}
            </svg>
          </div>
        )
      })()}
    </>
  )
}
