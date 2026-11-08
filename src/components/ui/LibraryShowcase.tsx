'use client'

import React, { useRef, useState, useEffect } from 'react'
import { HackyText } from './HackyText'
import { AnimatedLine } from './AnimatedLine'
import { showcaseState } from '../3d/deckState'

interface LibraryShowcaseProps {
  isVisible?: boolean
}

type DisplayFormat = 'fullhd-desktop' | 'compact-desktop' | 'stacked'

function getDisplayFormat(W: number, H: number): DisplayFormat {
  const aspect = W / H
  const isStacked = (W <= 1024) || (aspect <= 1.15)
  if (isStacked) return 'stacked'
  if (W >= 1440 && aspect >= 1.5) return 'fullhd-desktop'
  return 'compact-desktop'
}

export function LibraryShowcase({ isVisible: propVisible }: LibraryShowcaseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const paraRef = useRef<HTMLParagraphElement>(null)
  const [activeScene, setActiveScene] = useState<number>(showcaseState.activeScene)
  const [isSuppressed, setIsSuppressed] = useState<boolean>(showcaseState.suppressScene3Text)
  const [displayFormat, setDisplayFormat] = useState<DisplayFormat>(() => {
    if (typeof window === 'undefined') return 'fullhd-desktop'
    return getDisplayFormat(window.innerWidth, window.innerHeight)
  })
  const displayFormatRef = useRef<DisplayFormat>(displayFormat)
  displayFormatRef.current = displayFormat
  const isStacked = displayFormat === 'stacked'

  const [portalState, setPortalState] = useState<{
    phase: 'idle' | 'opening' | 'closing'
    progress: number
  }>({
    phase: showcaseState.portalPhase,
    progress: showcaseState.portalProgress,
  })

  useEffect(() => {
    const handleResize = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      const fmt = getDisplayFormat(W, H)
      setDisplayFormat(fmt)
      displayFormatRef.current = fmt
    }
    window.addEventListener('resize', handleResize, { passive: true })

    const isPhoneCheck = () => {
      if (typeof window === 'undefined') return false
      const W = window.innerWidth
      const H = window.innerHeight
      const aspect = W / Math.max(1, H)
      return W <= 880 || (displayFormatRef.current === 'stacked' && aspect < 0.85)
    }

    const updatePara = (phase: string, progress: number, scene: number) => {
      if (!paraRef.current) return
      if (showcaseState.suppressScene3Text) {
        paraRef.current.style.opacity = '0'
        paraRef.current.style.transform = 'translateY(40px)'
        return
      }

      const isPhone = isPhoneCheck()
      let t = 0
      if ((scene === 3 || scene === 4 || showcaseState.scene4Progress > 0 || showcaseState.scene4Phase !== 'idle') && phase === 'idle') {
        t = 1
      } else if (phase === 'opening') {
        const startP = isPhone ? 0.84 : 0.76
        const endP = isPhone ? 0.94 : 0.94
        t = Math.max(0, Math.min(1, (progress - startP) / (endP - startP)))
      } else if (phase === 'closing') {
        const startP = isPhone ? 0.91 : 0.76
        const endP = isPhone ? 0.98 : 0.94
        t = Math.max(0, Math.min(1, (progress - startP) / (endP - startP)))
      } else {
        t = scene === 3 ? 1 : 0
      }
      const smooth = t * t * (3 - 2 * t)
      const y = (1 - smooth) * 40
      paraRef.current.style.transform = `translateY(${y.toFixed(1)}px)`
      paraRef.current.style.opacity = smooth.toFixed(3)
    }

    // Initial setup
    updatePara(showcaseState.portalPhase, showcaseState.portalProgress, showcaseState.activeScene)

    const unsubSuppress = showcaseState.onSuppressScene3Text((suppress) => {
      setIsSuppressed(suppress)
      if (containerRef.current) {
        if (suppress) {
          containerRef.current.style.opacity = '0'
          containerRef.current.style.visibility = 'hidden'
        } else {
          const isStackedMode = displayFormatRef.current === 'stacked'
          const s4Cutoff = isStackedMode ? 0.16 : 0.30
          const isScene4or5 = showcaseState.activeScene >= 4 || showcaseState.scene4Progress >= s4Cutoff || showcaseState.scene5Progress > 0.001
          const isScene3 = showcaseState.activeScene === 3 && showcaseState.portalPhase === 'idle'
          const shouldShow = isScene3 && !isScene4or5
          containerRef.current.style.opacity = shouldShow ? '1' : '0'
          containerRef.current.style.visibility = shouldShow ? 'visible' : 'hidden'
        }
      }
      if (paraRef.current) {
        if (suppress) {
          paraRef.current.style.opacity = '0'
          paraRef.current.style.transform = 'translateY(40px)'
        } else {
          updatePara(showcaseState.portalPhase, showcaseState.portalProgress, showcaseState.activeScene)
        }
      }
    })

    const unsubScene = showcaseState.onActiveSceneChange((s) => {
      setActiveScene(s)
      updatePara(showcaseState.portalPhase, showcaseState.portalProgress, s)
      if (containerRef.current && !showcaseState.suppressScene3Text) {
        if (s >= 4 && showcaseState.scene4Phase === 'idle' && showcaseState.scene5Phase === 'idle') {
          containerRef.current.style.opacity = '0'
          containerRef.current.style.visibility = 'hidden'
        } else if (s === 3 && showcaseState.portalPhase === 'idle' && showcaseState.scene4Phase === 'idle') {
          containerRef.current.style.opacity = '1'
          containerRef.current.style.visibility = 'visible'
        } else if ((s === 1 || s === 2) && showcaseState.portalPhase === 'idle') {
          containerRef.current.style.opacity = '0'
          containerRef.current.style.visibility = 'hidden'
        }
      }
    })

    const unsubPortal = showcaseState.onPortalChange((data) => {
      setPortalState(data)
      if (containerRef.current && !showcaseState.suppressScene3Text) {
        const isScene4Or5 = showcaseState.activeScene >= 4 || showcaseState.scene4Progress > 0.30 || showcaseState.scene5Progress > 0.001
        if (!isScene4Or5) {
          const isPhone = isPhoneCheck()
          if (data.phase === 'opening') {
            const minOpenP = isPhone ? 0.84 : 0.76
            const isVis = data.progress >= minOpenP
            containerRef.current.style.visibility = isVis ? 'visible' : 'hidden'
            containerRef.current.style.opacity = isVis ? '1' : '0'
          } else if (data.phase === 'closing') {
            const isVis = isPhone ? data.progress >= 0.91 : true
            let op = 1
            if (isPhone) {
              if (data.progress < 0.91) {
                op = 0
              } else {
                const u = Math.max(0, Math.min(1, (data.progress - 0.91) / (0.98 - 0.91)))
                op = u * u * (3 - 2 * u)
              }
            }
            containerRef.current.style.visibility = isVis ? 'visible' : 'hidden'
            containerRef.current.style.opacity = isVis ? op.toFixed(3) : '1'
          } else {
            const isVis = showcaseState.activeScene === 3
            containerRef.current.style.visibility = isVis ? 'visible' : 'hidden'
            containerRef.current.style.opacity = isVis ? '1' : '0'
          }
        }
      }
      updatePara(data.phase, data.progress, showcaseState.activeScene)
    })

    const unsubScene4 = showcaseState.onScene4Change((prog, phase, _targetScene) => {
      if (!containerRef.current) return
      
      const isExiting5 = 
        showcaseState.navTargetScene === 3 || 
        showcaseState.navTargetScene === 4 ||
        (showcaseState.scene5Phase === 'transitioning' && showcaseState.scene5TargetScene !== 5)

      // If text is suppressed, or in Scene 5 (and not exiting to 3/4), stay hidden:
      if (showcaseState.suppressScene3Text || showcaseState.scene5Progress > 0.001 || (showcaseState.activeScene === 5 && !isExiting5)) {
        containerRef.current.style.opacity = '0'
        containerRef.current.style.visibility = 'hidden'
        return
      }

      // In idle state settled at Scene 4:
      if (phase === 'idle' && showcaseState.activeScene >= 4) {
        containerRef.current.style.opacity = '0'
        containerRef.current.style.visibility = 'hidden'
        return
      }

      const isStackedMode = displayFormatRef.current === 'stacked'
      const isPhone = isPhoneCheck()
      const FADE_CUTOFF = isPhone ? 0.12 : (isStackedMode ? 0.16 : 0.30)

      // Symmetric dissolve & reverse dissolve:
      // When prog >= FADE_CUTOFF: screens are moving across or active -> 100% dissolved (opacity 0)
      // When prog < FADE_CUTOFF: screens are safely on the left ring -> smoothly fades in/out on clean white background
      let opacity = 1
      if (prog >= FADE_CUTOFF) {
        opacity = 0
      } else {
        const t = Math.max(0, Math.min(1, 1 - prog / FADE_CUTOFF))
        opacity = t * t * (3 - 2 * t)
      }

      const isVis = opacity > 0.002
      containerRef.current.style.visibility = isVis ? 'visible' : 'hidden'
      containerRef.current.style.opacity = opacity.toFixed(3)

      if (paraRef.current && isVis) {
        paraRef.current.style.opacity = '1'
        paraRef.current.style.transform = 'translateY(0px)'
      }
    })

    const unsubScene5 = showcaseState.onScene5Change((prog) => {
      if (!containerRef.current) return
      const isExiting5 = 
        showcaseState.navTargetScene === 3 || 
        showcaseState.navTargetScene === 4 ||
        (showcaseState.scene5Phase === 'transitioning' && showcaseState.scene5TargetScene !== 5)

      if (prog > 0.001 || (showcaseState.activeScene === 5 && !isExiting5)) {
        containerRef.current.style.opacity = '0'
        containerRef.current.style.visibility = 'hidden'
      } else if (
        prog <= 0.001 &&
        showcaseState.activeScene === 3 &&
        showcaseState.scene4Phase === 'idle' &&
        showcaseState.scene4Progress <= 0.001 &&
        !showcaseState.suppressScene3Text
      ) {
        containerRef.current.style.opacity = '1'
        containerRef.current.style.visibility = 'visible'
      }
    })

    return () => {
      window.removeEventListener('resize', handleResize)
      unsubSuppress()
      unsubScene()
      unsubPortal()
      unsubScene4()
      unsubScene5()
    }
  }, [])

  const isExiting5 = 
    showcaseState.navTargetScene === 3 || 
    showcaseState.navTargetScene === 4 ||
    (showcaseState.scene5Phase === 'transitioning' && showcaseState.scene5TargetScene !== 5)

  const isPhone = isStacked && (typeof window !== 'undefined' ? (window.innerWidth / Math.max(1, window.innerHeight) < 0.85 || window.innerWidth <= 880) : false)

  const s4Cutoff = isPhone ? 0.12 : (isStacked ? 0.16 : 0.30)
  const isScene4Or5Hidden =
    (activeScene === 4 && showcaseState.scene4Progress >= s4Cutoff) ||
    (activeScene === 5 && !isExiting5) ||
    showcaseState.scene5Progress > 0.001

  const openThreshold = isPhone ? 0.84 : 0.76
  const isClosingVisible = isPhone ? (portalState.progress >= 0.91) : true

  // Container stays visible throughout Scene 3, portal opening (>= openThreshold), during closing phase, and in Scene 4 before dissolve cutoff
  const isContainerVisible =
    !isSuppressed &&
    !isScene4Or5Hidden &&
    (propVisible !== false) &&
    (
      (activeScene === 3 && portalState.phase === 'idle') ||
      (portalState.phase === 'opening' && portalState.progress >= openThreshold) ||
      (portalState.phase === 'closing' && isClosingVisible) ||
      (activeScene === 4 && showcaseState.scene4Progress < s4Cutoff)
    )

  // Trigger for HackyText and AnimatedLine:
  // - Starts FALSE in Scene 1 & 2
  // - Triggers TRUE when entering Scene 3 (portal opening >= openThreshold)
  // - STAYS TRUE throughout Scene 3, Scene 4 and Scene 5 so text remains decoded and dissolves together as a unit without re-scrambling
  // - Resets to FALSE only when returning to Scene 2 or Scene 1, ensuring that future entry will play full HackyText decoding animation!
  const isTriggerActive =
    !isSuppressed &&
    (
      (activeScene >= 3 && portalState.phase === 'idle') ||
      (portalState.phase === 'opening' && portalState.progress >= openThreshold) ||
      (portalState.phase === 'closing' && portalState.progress >= (isPhone ? 0.94 : 0.92))
    )

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 pointer-events-none"
      style={{
        visibility: isContainerVisible ? 'visible' : 'hidden',
        opacity: isContainerVisible ? 1 : 0,
      }}
    >
      {/* 1. SECTION 3: ONE LIBRARY & UNIFIED CLOUD ECOSYSTEM */}
      <div 
        id="card-library"
        className="absolute top-[calc(50%-32px)] -translate-y-1/2 pointer-events-none z-10"
        style={{
          right: 'var(--card-library-right, 4rem)',
        }}
      >
        <div className="w-[380px] lg:w-[420px] max-w-[85vw] text-left pointer-events-auto">
          {/* Technical Section Protocol Tag with HackyText decryption */}
          <div className="flex items-center font-mono text-xs text-neutral-500 tracking-[0.2em] uppercase mb-2">
            <span className="text-black font-bold mr-2">
              <HackyText text="[//]" trigger={isTriggerActive} silent={!isContainerVisible} delay={0} speed={0.7} reverseSpeed={0.5} />
            </span>
            <HackyText 
              text="STEAM ECOSYSTEM // CLOUD INTEGRATION" 
              trigger={isTriggerActive} 
              silent={!isContainerVisible}
              delay={40}
              speed={0.8}
              reverseSpeed={0.48}
            />
          </div>

          {/* Main Headline in ABC Whyte (Swiss Grotesque - clean solid strokes) */}
          <h2
            aria-label="One Library"
            className="text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold tracking-tight text-black uppercase leading-[1.0] mb-3 font-sans text-balance"
          >
            <HackyText 
              text="ONE LIBRARY" 
              trigger={isTriggerActive} 
              silent={!isContainerVisible}
              delay={80}
              speed={1.0}
              reverseSpeed={0.62}
            />
          </h2>

          {/* Horizontal Dividing Line with Technical Coordinate & Synchronized Rollback */}
          <AnimatedLine trigger={isTriggerActive} delay={100} baseDuration={480} reverseDuration={360}>
            <div className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest flex-shrink-0 min-w-[155px] text-right whitespace-nowrap tabular-nums">
              <HackyText text="LOC: 0.90 // CLOUD.SYS" trigger={isTriggerActive} silent={!isContainerVisible} delay={140} speed={0.9} reverseSpeed={0.52} />
            </div>
          </AnimatedLine>

          {/* Detailed Editorial Narrative: Fly-up entrance (40px -> 0px) and reverse rollback (0px -> 40px) */}
          <p
            ref={paraRef}
            style={{ transform: 'translateY(40px)', opacity: 0 }}
            className="text-sm sm:text-base text-neutral-700 font-normal leading-relaxed font-sans text-pretty"
          >
            All your games are already here. Sign in to access your full Steam library, cloud saves, and community features.<br className="sm:hidden" /> No rebuying titles. No&nbsp;subscription fees.
          </p>
        </div>
      </div>
    </div>
  )
}
