'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
import { showcaseState, getScrollElement } from '../3d/deckState'
import { HackyText } from './HackyText'
import { AnimatedLine } from './AnimatedLine'
import { BladeShutter } from './BladeShutter'
import { GameShowcaseReel } from './GameShowcaseReel'
import { PortalWipe } from './PortalWipe'
import { PerformanceSpecsOverlay } from './PerformanceSpecsOverlay'
import { soundManager } from '../../audio/soundEngine'
import { useResponsiveCardMargins } from './useResponsiveCardMargins'
import { trackEvent } from '@/lib/analytics'

if (typeof window !== 'undefined') {
  window.__soundManager = soundManager
}

import { HeaderBar } from './HeaderBar'
import { DockLayer } from './DockLayer'
import { useOverlayInteractions } from './useOverlayInteractions'
import { useOverlayRafLoop } from './useOverlayRafLoop'
import { useOverlayHeaderHover } from './useOverlayHeaderHover'

export function Overlay() {
  useResponsiveCardMargins()
  const [mounted, setMounted] = useState(false)

  // Hero card state: active when console reaches hero offset (p >= 0.19)
  const [cardActive, setCardActive] = useState({
    card1: false,
  })
  const cardActiveRef = useRef({
    card1: false,
  })

  // Active game, scene, and shutter state
  const [activeGameIndex, setActiveGameIndex] = useState(showcaseState.activeGameIndex)
  const [activeScene, setActiveScene] = useState<1 | 2 | 3 | 4 | 5>(showcaseState.activeScene)
  const [navTargetScene, setNavTargetScene] = useState<1 | 2 | 3 | 4 | 5>(
    () => showcaseState.navTargetScene || showcaseState.activeScene || 1
  )
  const [portalPhase, setPortalPhase] = useState(showcaseState.portalPhase)
  const [scene5Phase, setScene5Phase] = useState<'idle' | 'transitioning'>(showcaseState.scene5Phase)
  const [cycleId, setCycleId] = useState(0)
  const [shutterPhase, setShutterPhase] = useState(showcaseState.shutterPhase)
  const [isDarkroomVisible, setIsDarkroomVisible] = useState(false)
  const isDarkroomVisibleRef = useRef(false)
  const lightDockRef = useRef<HTMLDivElement>(null)
  const darkDockRef = useRef<HTMLDivElement>(null)
  const portalDarkDockRef = useRef<HTMLDivElement>(null)
  const portalLightDockRef = useRef<HTMLDivElement>(null)

  // DOM element references for 120 FPS requestAnimationFrame render loop
  const headerRef = useRef<HTMLElement>(null)
  const darkroomHeaderRef = useRef<HTMLElement>(null)
  const portalDarkHeaderRef = useRef<HTMLElement>(null)
  const portalWhiteHeaderRef = useRef<HTMLElement>(null)
  const lastWhiteActiveRef = useRef<boolean | null>(null)
  const lastDarkActiveRef = useRef<boolean | null>(null)
  const navOverviewRef = useRef<HTMLButtonElement>(null)
  const bootPromptRef = useRef<HTMLDivElement>(null)
  const mobileDockRef = useRef<HTMLElement>(null)
  const lastDockVisibleRef = useRef<boolean | null>(null)
  const card1Ref = useRef<HTMLDivElement>(null)
  const card1ParaRef = useRef<HTMLParagraphElement>(null)
  const card1ParaProgRef = useRef<number>(0)
  const card1CoordRef = useRef<HTMLDivElement>(null)
  const card1ExitStartTimeRef = useRef<number | null>(null)
  const card1WasVisibleAtPortalStartRef = useRef<boolean>(false)
  const card1InitialOpacityRef = useRef<number>(0)
  const card1ParaInitialProgRef = useRef<number>(0)
  const lastOffsetRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const hasBootChimedRef = useRef<boolean>(false)
  const isCard1TextCompleteRef = useRef<boolean>(false)
  const pendingScene2TransitionRef = useRef<boolean>(false)
  const pendingScene2TimerRef = useRef<NodeJS.Timeout | null>(null)

  // Synchronized navigation hover state across Light & Dark headers
  const [hoveredNav, setHoveredNav] = useState<number | null>(null)
  // Synchronized cart action button hover state across Light & Dark headers
  const [isCartHovered, setIsCartHovered] = useState<boolean>(false)
  // Synchronized sound toggle action button hover state across Light & Dark headers
  const [isSoundHovered, setIsSoundHovered] = useState<boolean>(false)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)
  const arrowLeftHeldRef = useRef<boolean>(false)
  const arrowRightHeldRef = useRef<boolean>(false)
  const arrowDownHeldRef = useRef<boolean>(false)
  const arrowUpHeldRef = useRef<boolean>(false)

  // Tracking cart click & hover suppression to guarantee motionless click and silent unpressed return
  const cartClickedRef = useRef<boolean>(false)
  const suppressCartHoverRef = useRef<boolean>(false)

  const handleCartClick = useCallback(() => {
    trackEvent('cta_click', {
      button: 'add_to_cart_header',
      url: 'https://store.steampowered.com/steamdeck',
      scene: showcaseState.activeScene,
    })
    soundManager.playCartAdd()
    cartClickedRef.current = true
    suppressCartHoverRef.current = true
    const cartBtns = document.querySelectorAll<HTMLElement>('header a[href*="steampowered.com"]')
    cartBtns.forEach((btn) => {
      btn.setAttribute('data-suppress-hover', 'true')
    })
    // Note: Do NOT call setIsCartHovered(false) here! The button stays firmly filled/pressed in place.
  }, [])

  const updateCartHovered = useCallback((hovered: boolean) => {
    if (suppressCartHoverRef.current && hovered) {
      return
    }
    setIsCartHovered(hovered)
  }, [])

  const executePendingScene2Transition = useCallback(() => {
    if (!pendingScene2TransitionRef.current) return
    pendingScene2TransitionRef.current = false
    if (pendingScene2TimerRef.current) {
      clearTimeout(pendingScene2TimerRef.current)
      pendingScene2TimerRef.current = null
    }
    pendingScene2TimerRef.current = setTimeout(() => {
      if (showcaseState.activeScene === 1 && !showcaseState.isTransitioning) {
        showcaseState.triggerTransition(2, 'gesture')
      }
    }, 550)
  }, [])

  const markCard1Complete = useCallback(() => {
    showcaseState.isScene1TextComplete = true
    isCard1TextCompleteRef.current = true
    if (pendingScene2TransitionRef.current) {
      executePendingScene2Transition()
    }
  }, [executePendingScene2Transition])

  const requestScene2TransitionFromMobile = useCallback(() => {
    if (showcaseState.activeScene !== 1 || showcaseState.isTransitioning) return

    if (showcaseState.isScene1TextComplete) {
      if (pendingScene2TimerRef.current) {
        clearTimeout(pendingScene2TimerRef.current)
        pendingScene2TimerRef.current = null
      }
      pendingScene2TransitionRef.current = false
      showcaseState.triggerTransition(2, 'gesture')
      return
    }

    pendingScene2TransitionRef.current = true
    const el = getScrollElement()
    if (el) {
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 0) {
        const target = maxScroll * 0.28
        const proxy = { top: el.scrollTop }
        gsap.killTweensOf(proxy)
        gsap.to(proxy, {
          top: target,
          duration: 0.65,
          ease: 'power2.out',
          onUpdate: () => {
            if (el) {
              el.scrollTop = proxy.top
            }
          },
        })
      }
    }

    if (!cardActiveRef.current.card1) {
      cardActiveRef.current.card1 = true
      setCardActive({ card1: true })
    }

    if (pendingScene2TimerRef.current) clearTimeout(pendingScene2TimerRef.current)
    pendingScene2TimerRef.current = setTimeout(() => {
      if (pendingScene2TransitionRef.current && showcaseState.activeScene === 1) {
        markCard1Complete()
      }
    }, 2800)
  }, [markCard1Complete])

  useEffect(() => {
    showcaseState.requestScene2FromMobile = requestScene2TransitionFromMobile
    return () => {
      showcaseState.requestScene2FromMobile = null
    }
  }, [requestScene2TransitionFromMobile])

  useOverlayHeaderHover({
    hoveredNav,
    setHoveredNav,
    isCartHovered,
    setIsCartHovered,
    isSoundHovered,
    setIsSoundHovered,
    lastMousePosRef,
    cartClickedRef,
    suppressCartHoverRef,
    portalPhase,
    shutterPhase,
    scene5Phase,
    activeScene,
  })



  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      window.showcaseState = showcaseState
    }
    const unsubs = [
      showcaseState.onGameChange((idx) => {
        setActiveGameIndex(idx)
        setCycleId((c) => c + 1)
      }),
      showcaseState.onShutterPhaseChange((phase) => {
        setShutterPhase(phase)
      }),
      showcaseState.onActiveSceneChange((scene) => {
        arrowDownHeldRef.current = false
        arrowUpHeldRef.current = false
        setActiveScene(scene)
      }),
      showcaseState.onNavTargetChange((scene) => {
        setNavTargetScene(scene)
      }),
      showcaseState.onPortalChange((data) => {
        setPortalPhase(data.phase)
      }),
      showcaseState.onScene5Change((_, phase) => {
        setScene5Phase(phase)
      }),
    ]
    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [])

  // Strict scroll interception, gestures, and keyboard scene routing
  useOverlayInteractions({
    arrowLeftHeldRef,
    arrowRightHeldRef,
    arrowDownHeldRef,
    arrowUpHeldRef,
    requestScene2TransitionFromMobile,
  })

  // Dismiss power-on prompt upon scroll movement
  useEffect(() => {
    let cleanup: (() => void) | undefined

    const attachScrollListener = () => {
      const el = showcaseState.scrollEl
      if (!el) {
        frameId = requestAnimationFrame(attachScrollListener)
        return
      }
      const onScroll = () => {
        if (bootPromptRef.current) {
          const isHidden = !showcaseState.isReady
            ? false
            : Boolean(
                showcaseState.activeScene > 1 ||
                showcaseState.navTargetScene > 1 ||
                showcaseState.offset > 0.05 ||
                el.scrollTop > 8
              )
          bootPromptRef.current.style.opacity = isHidden ? '0' : '1'
          bootPromptRef.current.style.transform = isHidden ? 'translateY(16px)' : 'translateY(0)'
          bootPromptRef.current.style.pointerEvents = isHidden ? 'none' : 'auto'
          bootPromptRef.current.style.visibility = isHidden ? 'hidden' : 'visible'
          if ('inert' in bootPromptRef.current) {
            bootPromptRef.current.inert = isHidden
          }
        }

        // Lock scroll offset at section boundaries and trigger scene transition
        if (!showcaseState.isTransitioning && showcaseState.isReady) {
          const now = performance.now()
          const wasRecentlyDraggingCurtain = (now - showcaseState.lastCurtainDragEndTime) < 600
          if (showcaseState.activeScene === 2 && (showcaseState.isCurtainDragging || wasRecentlyDraggingCurtain)) {
            return
          }
          const maxScroll = el.scrollHeight - el.clientHeight
          if (maxScroll > 0) {
            const rawP = el.scrollTop / maxScroll
            if (showcaseState.activeScene === 1 && rawP >= 0.45) {
              const isMobile = window.innerWidth <= 880
              if (isMobile && !showcaseState.isScene1TextComplete) {
                el.scrollTop = maxScroll * 0.28
                requestScene2TransitionFromMobile()
                return
              }
              el.scrollTop = maxScroll * 0.45
              showcaseState.triggerTransition(2, 'scroll')
            } else if (showcaseState.activeScene === 2) {
              if (rawP <= 0.58) {
                el.scrollTop = maxScroll * 0.58
                showcaseState.triggerTransition(1)
              } else if (rawP >= 0.70) {
                el.scrollTop = maxScroll * 0.65
                showcaseState.triggerReelTransition(3)
              }
            } else if (showcaseState.activeScene === 3) {
              if (rawP <= 0.82) {
                el.scrollTop = maxScroll * 0.90
                showcaseState.triggerReelTransition(2)
              }
            }
          }
        }
      }
      el.addEventListener('scroll', onScroll, { passive: true })
      onScroll()
      cleanup = () => el.removeEventListener('scroll', onScroll)
    }

    let frameId = requestAnimationFrame(attachScrollListener)
    return () => {
      cancelAnimationFrame(frameId)
      if (cleanup) cleanup()
    }
  }, [])

  // Synchronize overlay state on each animation frame
  // Synchronize overlay state on each animation frame
  useOverlayRafLoop({
    mounted,
    lastTimeRef,
    lastOffsetRef,
    arrowLeftHeldRef,
    arrowRightHeldRef,
    arrowDownHeldRef,
    arrowUpHeldRef,
    headerRef,
    darkroomHeaderRef,
    portalDarkHeaderRef,
    portalWhiteHeaderRef,
    lastWhiteActiveRef,
    lastDarkActiveRef,
    bootPromptRef,
    mobileDockRef,
    lastDockVisibleRef,
    lightDockRef,
    darkDockRef,
    portalDarkDockRef,
    portalLightDockRef,
    card1Ref,
    card1ParaRef,
    card1ParaProgRef,
    card1ExitStartTimeRef,
    card1WasVisibleAtPortalStartRef,
    card1InitialOpacityRef,
    card1ParaInitialProgRef,
    hasBootChimedRef,
    isCard1TextCompleteRef,
    cardActiveRef,
    setCardActive,
    isDarkroomVisibleRef,
    setIsDarkroomVisible,
    pendingScene2TransitionRef,
    pendingScene2TimerRef,
    requestScene2TransitionFromMobile,
  })

  if (!mounted) return null

  // Compute target scene for symmetrical geometry and instant tab indication across both headers:
  // On shutter closing (1 <-> 2), tab switches at the exact moment shutters meet at center:
  const isShutterClosing = shutterPhase === 'closing'
  const isShutterActive = shutterPhase === 'closing' || shutterPhase === 'closed' || shutterPhase === 'opening'
  const targetScene = isShutterClosing ? activeScene : (navTargetScene || activeScene)

  const isScene5Transition = (
    (activeScene === 4 && navTargetScene === 5) ||
    (activeScene === 5 && navTargetScene === 4) ||
    (activeScene === 3 && navTargetScene === 5) ||
    (activeScene === 5 && navTargetScene === 3)
  )

  const isDirect1To5Transition = (
    (portalPhase !== 'idle' || showcaseState.isTransitioning) && (
      (showcaseState.portalSourceScene === 1 && showcaseState.portalTargetScene === 5) ||
      (showcaseState.portalSourceScene === 5 && showcaseState.portalTargetScene === 1)
    )
  ) || (
    (activeScene === 5 && (targetScene === 1 || showcaseState.navTargetScene === 1)) ||
    (activeScene === 1 && (targetScene === 5 || showcaseState.navTargetScene === 5))
  )

  const isDirect2To5Transition = (
    (portalPhase !== 'idle' || showcaseState.isTransitioning) && (
      (showcaseState.portalSourceScene === 2 && showcaseState.portalTargetScene === 5) ||
      (showcaseState.portalSourceScene === 5 && showcaseState.portalTargetScene === 2)
    )
  ) || (
    (activeScene === 5 && (targetScene === 2 || showcaseState.navTargetScene === 2)) ||
    (activeScene === 2 && (targetScene === 5 || showcaseState.navTargetScene === 5))
  )

  const isPortal1To5 = isDirect1To5Transition

  const isPortal2To5 = isDirect2To5Transition

  const isPortal2To3 = !isPortal2To5 && (
    (portalPhase !== 'idle' && (
      ((showcaseState.portalSourceScene === 2) && (showcaseState.portalTargetScene === 3 || showcaseState.portalTargetScene === 4)) ||
      ((showcaseState.portalSourceScene === 3 || showcaseState.portalSourceScene === 4) && (showcaseState.portalTargetScene === 2))
    )) || (
      showcaseState.isTransitioning && !isShutterActive && (
        (activeScene === 2 && (targetScene === 3 || targetScene === 4)) ||
        ((activeScene === 3 || activeScene === 4) && targetScene === 2)
      )
    )
  )

  const isPortal1To3 = !isPortal1To5 && (
    (portalPhase !== 'idle' && (
      ((showcaseState.portalSourceScene === 1) && (showcaseState.portalTargetScene === 3 || showcaseState.portalTargetScene === 4)) ||
      ((showcaseState.portalSourceScene === 3 || showcaseState.portalSourceScene === 4) && (showcaseState.portalTargetScene === 1))
    )) || (
      showcaseState.isTransitioning && !isShutterActive && (
        (activeScene === 1 && (targetScene === 3 || targetScene === 4)) ||
        ((activeScene === 3 || activeScene === 4) && targetScene === 1)
      )
    )
  )

  let lightActiveTab = targetScene === 3 || targetScene === 4 ? 3 : targetScene
  let darkActiveTab = targetScene === 3 || targetScene === 4 ? 3 : targetScene

  if (isScene5Transition) {
    lightActiveTab = 3
    darkActiveTab = 5
  } else if (isPortal1To5) {
    lightActiveTab = 1
    darkActiveTab = 5
  } else if (isPortal2To3) {
    darkActiveTab = 2
    lightActiveTab = 3
  } else if (isPortal2To5) {
    darkActiveTab = 2
  } else if (isPortal1To3) {
    lightActiveTab = 1
  }

  // Mobile dock tab active state:
  // Active pill and highlighted destination tab lock synchronously across all layers
  // to avoid jumping or desyncing during multi-layer clip transitions.
  const mobileActiveTab = targetScene === 3 || targetScene === 4 ? 3 : targetScene

  return (
    <>
      {/* Navigation Headers */}
      <HeaderBar
        id="top-header-white"
        headerRef={headerRef}
        theme="light"
        activeTab={lightActiveTab}
        isSoundHovered={isSoundHovered}
        setIsSoundHovered={setIsSoundHovered}
        hoveredNav={hoveredNav}
        setHoveredNav={setHoveredNav}
        isCartHovered={isCartHovered}
        setIsCartHovered={updateCartHovered}
        onCartClick={handleCartClick}
        navOverviewRef={navOverviewRef}
      />

      <HeaderBar
        id="top-header-dark"
        headerRef={darkroomHeaderRef}
        theme="dark"
        activeTab={darkActiveTab}
        isSoundHovered={isSoundHovered}
        setIsSoundHovered={setIsSoundHovered}
        hoveredNav={hoveredNav}
        setHoveredNav={setHoveredNav}
        isCartHovered={isCartHovered}
        setIsCartHovered={updateCartHovered}
        onCartClick={handleCartClick}
      />

      {/* Portal In-Between Overlay Headers for 2<->5 and 1<->3 Dynamic Bold Painting */}
      <HeaderBar
        id="top-header-dark-portal"
        headerRef={portalDarkHeaderRef}
        theme="dark"
        activeTab={5}
        isSoundHovered={isSoundHovered}
        setIsSoundHovered={setIsSoundHovered}
        hoveredNav={hoveredNav}
        setHoveredNav={setHoveredNav}
        isCartHovered={isCartHovered}
        setIsCartHovered={updateCartHovered}
        onCartClick={handleCartClick}
      />

      <HeaderBar
        id="top-header-white-portal"
        headerRef={portalWhiteHeaderRef}
        theme="light"
        activeTab={3}
        isSoundHovered={isSoundHovered}
        setIsSoundHovered={setIsSoundHovered}
        hoveredNav={hoveredNav}
        setHoveredNav={setHoveredNav}
        isCartHovered={isCartHovered}
        setIsCartHovered={updateCartHovered}
        onCartClick={handleCartClick}
      />

      {/* Mobile Navigation Dock */}
      <nav
        ref={mobileDockRef}
        aria-label="Mobile Scene Navigation"
        style={{ opacity: 0, visibility: 'hidden', transform: 'translateY(calc(100% + 1.5rem))' }}
        className="hud-mobile-dock hud-mobile-dock-bottom fixed left-0 right-0 mx-auto w-max max-w-[calc(100vw-2rem)] z-[45] items-center p-[2px] box-border pointer-events-none"
      >
        <div className="relative">
          <DockLayer
            dockRef={lightDockRef}
            theme="light"
            activeTab={mobileActiveTab}
            hoveredNav={hoveredNav}
            setHoveredNav={setHoveredNav}
          />
          <DockLayer
            dockRef={darkDockRef}
            theme="dark"
            activeTab={mobileActiveTab}
            hoveredNav={hoveredNav}
            setHoveredNav={setHoveredNav}
            isAbsolute={true}
          />
          <DockLayer
            dockRef={portalDarkDockRef}
            theme="dark"
            activeTab={mobileActiveTab}
            hoveredNav={hoveredNav}
            setHoveredNav={setHoveredNav}
            isAbsolute={true}
          />
          <DockLayer
            dockRef={portalLightDockRef}
            theme="light"
            activeTab={mobileActiveTab}
            hoveredNav={hoveredNav}
            setHoveredNav={setHoveredNav}
            isAbsolute={true}
          />
        </div>
      </nav>

      {/* Standby Boot Prompt */}
      <div
        ref={bootPromptRef}
        className="fixed bottom-8 sm:bottom-10 left-0 right-0 w-full flex items-center justify-center pointer-events-none transition-all duration-500 ease-out z-40 px-4"
      >
        <button
          id="boot-power-button"
          type="button"
          onClick={() => {
            trackEvent('boot_power_on', { timestamp: Date.now() })
            hasBootChimedRef.current = true
            soundManager.startAmbient()
            const el = getScrollElement()
            if (el) {
              const maxScroll = el.scrollHeight - el.clientHeight
              const target = maxScroll * 0.28
              const proxy = { top: el.scrollTop }
              gsap.killTweensOf(proxy)
              const tween = gsap.to(proxy, {
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
              const cancel = () => tween.kill()
              window.addEventListener('wheel', cancel, { once: true, passive: true })
              window.addEventListener('touchmove', cancel, { once: true, passive: true })
            } else if (showcaseState.scrollTo) {
              showcaseState.scrollTo(0.28)
            }
          }}
          aria-label="Power on Steam Deck and scroll to Section 01: Overview"
          className="group pointer-events-auto inline-flex items-center gap-3 text-white transition-opacity duration-300 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-sm active:opacity-75 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] py-2.5 px-3 min-h-[44px] touch-manipulation"
        >
          <span className="sr-only">Power on Steam Deck and scroll to Section 01: Overview</span>

          <span aria-hidden="true" className="font-mono text-xs tracking-[0.18em] text-white/80 group-hover:text-white font-medium uppercase transition-colors select-none">
            <HackyText text="SCROLL TO POWER ON" speed={0.9} silent />
          </span>

          <div
            className="w-3.5 h-5 rounded-full border border-white/60 group-hover:border-white flex items-start justify-center pt-[2.5px] transition-colors duration-200 flex-shrink-0"
            aria-hidden="true"
          >
            <div className="w-[2px] h-[5px] bg-white/60 group-hover:bg-white rounded-full transition-colors duration-200" />
          </div>
        </button>
      </div>

      {/* Hero Section */}
      <div
        id="card-hero"
        ref={card1Ref}
        className="fixed top-[calc(50%-32px)] -translate-y-1/2 pointer-events-none opacity-0 z-10"
        style={{ 
          left: 'var(--card-hero-left, 4rem)',
          visibility: 'hidden' 
        }}
      >
        <div className="w-[380px] lg:w-[420px] max-w-[85vw] text-left pointer-events-auto">
          <div className="flex items-center font-mono text-xs text-neutral-500 tracking-[0.2em] uppercase mb-2">
            <span className="text-black font-bold mr-2">
              <HackyText text="[//]" trigger={cardActive.card1} delay={0} speed={0.7} reverseSpeed={0.5} />
            </span>
            <HackyText
              text="HARDWARE // ARCHITECTURE"
              trigger={cardActive.card1}
              delay={40}
              speed={0.8}
              reverseSpeed={0.48}
            />
          </div>

          <h1
            aria-label="Steam Deck"
            className="text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold tracking-tight text-black uppercase leading-[1.0] mb-3 font-sans text-balance"
          >
            <HackyText
              text="STEAM DECK"
              trigger={cardActive.card1}
              delay={80}
              speed={1.0}
              reverseSpeed={0.62}
              onComplete={markCard1Complete}
            />
          </h1>

          <AnimatedLine trigger={cardActive.card1} delay={100} baseDuration={480} reverseDuration={360}>
            <div
              ref={card1CoordRef}
              className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest flex-shrink-0 min-w-[155px] text-right whitespace-nowrap tabular-nums"
            >
              <HackyText text="LOC: 0.28 // SPEC.SYS" trigger={cardActive.card1} delay={140} speed={0.9} reverseSpeed={0.52} />
            </div>
          </AnimatedLine>

          <p
            ref={card1ParaRef}
            style={{ opacity: 0, transform: 'translateY(40px)' }}
            className="text-sm sm:text-base text-neutral-700 font-normal leading-relaxed font-sans text-pretty"
          >
            Your Steam games, built for the road. Powered by a custom 6&nbsp;nm AMD&nbsp;APU, a 7.4&quot; 90&nbsp;Hz HDR OLED display with true blacks, and a 50Whr battery for up to 12&nbsp;hours of play.
          </p>
        </div>
      </div>

      {/* Blade Shutter */}
      <BladeShutter phase={shutterPhase} />

      {/* Game Showcase Reel */}
      <GameShowcaseReel
        activeGameIndex={activeGameIndex}
        cycleId={cycleId}
        onGameChange={(idx) => showcaseState.setGame(idx)}
        isVisible={isDarkroomVisible}
      />

      {/* Portal Transition */}
      <PortalWipe />

      {/* Performance Specs */}
      <PerformanceSpecsOverlay />
    </>
  )
}
