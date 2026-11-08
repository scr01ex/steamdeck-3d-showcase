'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
import { HackyText } from './HackyText'
import { LinkHover } from './LinkHover'
import { showcaseState, ScreenBounds } from '../3d/deckState'
import { getSteamScreenController } from '../3d/SteamScreenTexture'
import { soundManager } from '../../audio/soundEngine'

import { SHOWCASE_GAMES } from '../3d/gamesData'
export { SHOWCASE_GAMES }

interface GameShowcaseReelProps {
  activeGameIndex: number
  cycleId?: number
  onGameChange: (index: number) => void
  isVisible?: boolean
}

const CYCLE_DURATION_MS = 8000 // 8 seconds per game

function GameProgressBar({ 
  cycleKey,
  isVisible,
  onComplete, 
  accentColor 
}: { 
  cycleKey: string | number
  isVisible: boolean
  onComplete: () => void
  accentColor: string
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const lastPRef = useRef(0)

  useEffect(() => {
    if (!isVisible) return
    let frameId: number
    const startTime = performance.now()
    lastPRef.current = 0

    const screenCtrl = typeof window !== 'undefined' ? getSteamScreenController() : null

    const tick = (now: number) => {
      let p = 0
      if (screenCtrl && screenCtrl.isPlaying()) {
        const { currentTime, duration } = screenCtrl.getVideoProgress()
        if (duration > 0) {
          p = Math.min(1, currentTime / duration)
        }
      } else {
        const elapsed = now - startTime
        p = Math.min(1, elapsed / CYCLE_DURATION_MS)
      }

      if (barRef.current) {
        barRef.current.style.width = `${(p * 100).toFixed(1)}%`
      }

      // Trigger cycle advance on loop wrap-around
      if (p >= 0.995 || (lastPRef.current > 0.85 && p < 0.15)) {
        onComplete()
      } else {
        lastPRef.current = p
        frameId = requestAnimationFrame(tick)
      }
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [cycleKey, isVisible, onComplete])

  return (
    <div className="w-full h-[2px] bg-white/10 relative overflow-hidden">
      <div 
        ref={barRef}
        className="h-full will-change-transform"
        style={{
          width: '0%',
          backgroundColor: accentColor,
          boxShadow: `0 0 8px ${accentColor}`,
        }}
      />
    </div>
  )
}

/**
 * GameShowcaseReel Component
 * 
 * Sequential showcase of 4 games for the OLED Darkroom with prestigious typography,
 * HackyText decryption, live countdown progress bar, and interactive game tabs.
 */
export function GameShowcaseReel({
  activeGameIndex,
  cycleId = 0,
  onGameChange,
  isVisible = true,
}: GameShowcaseReelProps) {
  const currentGame = SHOWCASE_GAMES[activeGameIndex] || SHOWCASE_GAMES[0]

  const [splitPos, setSplitPos] = useState(showcaseState.splitPos)
  const [screenBounds, setScreenBounds] = useState<ScreenBounds>(showcaseState.screenBounds)
  const [showBezelDiff, setShowBezelDiff] = useState(showcaseState.showBezelDiff)
  const [isDragging, setIsDragging] = useState(false)
  const [targetPreset, setTargetPreset] = useState<number | null>(null)

  const curtainRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const oledLabelRef = useRef<HTMLDivElement>(null)
  const lcdLabelRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const lastQuantizedStepRef = useRef<number>(-1)
  const [isPortalActive, setIsPortalActive] = useState(showcaseState.portalPhase !== 'idle')

  useEffect(() => {
    return showcaseState.onPortalChange((data) => {
      setIsPortalActive(data.phase !== 'idle')
    })
  }, [])

  const screenBoundsRef = useRef(screenBounds)
  screenBoundsRef.current = screenBounds

  // Direct DOM position update for handle and labels avoiding React reconciliation latency
  const applySplitDOM = useCallback((pos: number) => {
    const pct = (pos * 100).toFixed(4)
    const invPct = (100 - parseFloat(pct)).toFixed(4)

    if (handleRef.current) {
      handleRef.current.style.left = `${pct}%`
    }
    if (oledLabelRef.current) {
      oledLabelRef.current.style.width = `${pct}%`
      const oledOpacity = Math.max(0, Math.min(1, (pos - 0.02) / 0.08))
      oledLabelRef.current.style.opacity = oledOpacity.toFixed(3)
    }
    if (lcdLabelRef.current) {
      lcdLabelRef.current.style.width = `${invPct}%`
      const lcdOpacity = Math.max(0, Math.min(1, (0.98 - pos) / 0.08))
      lcdLabelRef.current.style.opacity = lcdOpacity.toFixed(3)
    }
  }, [])

  useEffect(() => {
    return showcaseState.onSplitChange((pos) => {
      setSplitPos(pos)
      if (!isDraggingRef.current) {
        applySplitDOM(pos)
      }
    })
  }, [applySplitDOM])

  useEffect(() => {
    return showcaseState.onBezelDiffChange((active) => {
      setShowBezelDiff(active)
    })
  }, [])

  const prevBoundsRef = useRef(screenBounds)
  useEffect(() => {
    return showcaseState.onScreenBoundsChange((bounds) => {
      screenBoundsRef.current = bounds
      if (curtainRef.current) {
        curtainRef.current.style.left = `${(bounds.left * 100).toFixed(4)}%`
        curtainRef.current.style.top = `${(bounds.top * 100).toFixed(4)}%`
        curtainRef.current.style.width = `${(bounds.width * 100).toFixed(4)}%`
        curtainRef.current.style.height = `${(bounds.height * 100).toFixed(4)}%`
      }
      const prev = prevBoundsRef.current
      if (
        Math.abs(bounds.left - prev.left) > 0.0005 ||
        Math.abs(bounds.width - prev.width) > 0.0005 ||
        Math.abs(bounds.top - prev.top) > 0.0005 ||
        Math.abs(bounds.height - prev.height) > 0.0005
      ) {
        prevBoundsRef.current = bounds
        setScreenBounds(bounds)
      }
    })
  }, [])

  const handleNextGame = useCallback(() => {
    onGameChange((activeGameIndex + 1) % SHOWCASE_GAMES.length)
  }, [activeGameIndex, onGameChange])

  // Smooth split transition via GSAP on comparison preset clicks (100% OLED, 50/50, 100% LCD)
  // Active font weight updates immediately on click without waiting for curtain tween
  const animateToSplit = useCallback((targetPos: number) => {
    gsap.killTweensOf(showcaseState)
    setTargetPreset(targetPos)
    gsap.to(showcaseState, {
      splitPos: targetPos,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        showcaseState.setSplitPos(showcaseState.splitPos)
        applySplitDOM(showcaseState.splitPos)
      },
      onComplete: () => {
        setTargetPreset(null)
      },
    })
  }, [applySplitDOM])

  // Interactive split slider tracking with zero-latency synchronization
  const updatePosFromClientX = useCallback((clientX: number) => {
    if (typeof window === 'undefined') return
    setTargetPreset(null)
    const winW = window.innerWidth
    const leftPx = screenBoundsRef.current.left * winW
    const widthPx = screenBoundsRef.current.width * winW
    if (widthPx > 10) {
      const rel = Math.max(0, Math.min(1, (clientX - leftPx) / widthPx))
      const quant = Math.floor(rel * 12)
      if (quant !== lastQuantizedStepRef.current) {
        lastQuantizedStepRef.current = quant
        soundManager.playHaptic(0.55)
      }
      showcaseState.setSplitPos(rel)
      applySplitDOM(rel)
    }
  }, [applySplitDOM])

  const handlePointerDown = (e: React.PointerEvent) => {
    soundManager.playButtonClick()
    e.preventDefault()
    e.stopPropagation()
    gsap.killTweensOf(showcaseState)
    setTargetPreset(null)
    isDraggingRef.current = true
    setIsDragging(true)
    showcaseState.setIsCurtainDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    updatePosFromClientX(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    updatePosFromClientX(e.clientX)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      showcaseState.setIsCurtainDragging(false)
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
  }

  const handleLeftPct = (splitPos * 100).toFixed(3)
  const handleInvPct = (100 - parseFloat(handleLeftPct)).toFixed(3)

  return (
    <>
      <div
        ref={curtainRef}
        data-curtain="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={() => {
          showcaseState.setIsCurtainDragging(true)
        }}
        onTouchEnd={() => {
          showcaseState.setIsCurtainDragging(false)
        }}
        onTouchCancel={() => {
          showcaseState.setIsCurtainDragging(false)
        }}
        inert={!isVisible || showcaseState.isTransitioning ? true : undefined}
        style={{
          left: `${(screenBounds.left * 100).toFixed(4)}%`,
          top: `${(screenBounds.top * 100).toFixed(4)}%`,
          width: `${(screenBounds.width * 100).toFixed(4)}%`,
          height: `${(screenBounds.height * 100).toFixed(4)}%`,
          visibility: isVisible ? 'visible' : 'hidden',
          touchAction: 'none',
        }}
        className={`fixed z-30 pointer-events-auto cursor-ew-resize select-none touch-none ${
          isPortalActive ? '' : 'transition-opacity duration-200'
        } ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* OLED label (fades out as OLED side collapses) */}
        <div
          ref={oledLabelRef}
          className="absolute -top-14 sm:-top-16 left-0 flex items-center justify-center pointer-events-none overflow-visible will-change-[opacity,width]"
          style={{
            width: `${handleLeftPct}%`,
            opacity: Math.max(0, Math.min(1, (splitPos - 0.02) / 0.08)),
          }}
        >
          <div
            className={`flex items-center px-4 py-1.5 bg-black/90 border border-white/25 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.7)] backdrop-blur-md shrink-0 whitespace-nowrap transition-all ${
              showBezelDiff
                ? 'duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]'
                : 'duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]'
            }`}
          >
            <span className="text-white font-mono text-xs font-black tracking-[0.25em] uppercase whitespace-nowrap">
              OLED
            </span>
            <span
              className={`inline-flex items-center overflow-hidden whitespace-nowrap font-mono text-xs font-black tracking-[0.25em] uppercase text-white transition-all ${
                showBezelDiff
                  ? 'duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] max-w-[70px] opacity-100 ml-1.5 translate-x-0'
                  : 'duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] max-w-0 opacity-100 ml-0 -translate-x-1 pointer-events-none'
              }`}
            >
              <HackyText
                key="oled-size"
                text='7.4"'
                trigger={showBezelDiff}
                speed={0.6}
                reverseSpeed={0.9}
                delay={showBezelDiff ? 50 : 0}
                style={{ whiteSpace: 'nowrap' }}
                className="whitespace-nowrap font-mono text-xs font-black tracking-[0.25em] uppercase text-white"
              />
            </span>
          </div>
        </div>

        {/* LCD label (fades out as LCD side collapses) */}
        <div
          ref={lcdLabelRef}
          className="absolute -top-14 sm:-top-16 right-0 flex items-center justify-center pointer-events-none overflow-visible will-change-[opacity,width]"
          style={{
            width: `${handleInvPct}%`,
            opacity: Math.max(0, Math.min(1, (0.98 - splitPos) / 0.08)),
          }}
        >
          <div
            className={`flex items-center px-4 py-1.5 bg-black/90 border border-white/25 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.7)] backdrop-blur-md shrink-0 whitespace-nowrap transition-all ${
              showBezelDiff
                ? 'duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]'
                : 'duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]'
            }`}
          >
            <span className="text-white font-mono text-xs font-black tracking-[0.25em] uppercase whitespace-nowrap">
              LCD
            </span>
            <span
              className={`inline-flex items-center overflow-hidden whitespace-nowrap font-mono text-xs font-black tracking-[0.25em] uppercase text-white transition-all ${
                showBezelDiff
                  ? 'duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] max-w-[70px] opacity-100 ml-1.5 translate-x-0'
                  : 'duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] max-w-0 opacity-100 ml-0 -translate-x-1 pointer-events-none'
              }`}
            >
              <HackyText
                key="lcd-size"
                text='7.0"'
                trigger={showBezelDiff}
                speed={0.6}
                reverseSpeed={0.9}
                delay={showBezelDiff ? 50 : 0}
                style={{ whiteSpace: 'nowrap' }}
                className="whitespace-nowrap font-mono text-xs font-black tracking-[0.25em] uppercase text-white"
              />
            </span>
          </div>
        </div>

        <div
          ref={handleRef}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-auto will-change-[left]"
          style={{ left: `${handleLeftPct}%` }}
        >
          <div
            role="slider"
            tabIndex={0}
            aria-label="Display Split Position: OLED vs LCD comparison"
            aria-valuenow={Math.round(splitPos * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${Math.round(splitPos * 100)}% OLED, ${Math.round((1 - splitPos) * 100)}% LCD`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault()
                if (!e.repeat) {
                  soundManager.playButtonClick()
                  const next = Math.max(0, splitPos - 0.02)
                  setSplitPos(next)
                  showcaseState.setSplitPos(next)
                }
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (!e.repeat) {
                  soundManager.playButtonClick()
                  const next = Math.min(1, splitPos + 0.02)
                  setSplitPos(next)
                  showcaseState.setSplitPos(next)
                }
              } else if (e.key === 'Home') {
                e.preventDefault()
                soundManager.playButtonClick()
                setSplitPos(0)
                showcaseState.setSplitPos(0)
              } else if (e.key === 'End') {
                e.preventDefault()
                soundManager.playButtonClick()
                setSplitPos(1)
                showcaseState.setSplitPos(1)
              } else if (e.key === 'PageDown') {
                e.preventDefault()
                soundManager.playButtonClick()
                const next = Math.max(0, splitPos - 0.2)
                setSplitPos(next)
                showcaseState.setSplitPos(next)
              } else if (e.key === 'PageUp') {
                e.preventDefault()
                soundManager.playButtonClick()
                const next = Math.min(1, splitPos + 0.2)
                setSplitPos(next)
                showcaseState.setSplitPos(next)
              }
            }}
            className={`relative w-9 h-9 rounded-full bg-black/95 border border-white/80 shadow-[0_4px_16px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center justify-between px-2 text-white select-none transition-transform duration-150 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black cursor-ew-resize touch-none after:absolute after:-inset-2 after:content-[''] ${
              isDragging ? 'scale-110 border-white' : 'hover:scale-105'
            }`}
          >
            <svg className="w-2.5 h-2.5 text-white fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
            </svg>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1.5px] h-3.5 bg-white/80 rounded-full pointer-events-none" />
            <svg className="w-2.5 h-2.5 text-white fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </div>
        </div>
      </div>

      <div
        id="game-showcase-panel"
        inert={!isVisible || showcaseState.isTransitioning ? true : undefined}
        style={{ visibility: isVisible ? 'visible' : 'hidden' }}
        className={`fixed inset-0 z-30 pointer-events-none flex flex-col justify-end px-4 sm:px-8 lg:p-12 pb-[max(6.5rem,calc(env(safe-area-inset-bottom,0px)+6rem))] sm:pb-[max(4.5rem,calc(env(safe-area-inset-bottom,0px)+4rem))] lg:pb-12 ${
          isPortalActive ? '' : 'transition-opacity duration-700'
        } ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full max-w-6xl xl:max-w-7xl mx-auto flex flex-col gap-2.5 sm:gap-4 lg:gap-6 pointer-events-auto">
          {/* Progress Line */}
          <GameProgressBar
            cycleKey={`${activeGameIndex}-${cycleId}`}
            isVisible={isVisible}
            onComplete={handleNextGame}
            accentColor={currentGame.accentColor}
          />

          {/* Game Title with HackyText Decrypt - Fixed container height prevents vertical jumping */}
          <div className="game-title-container text-left w-full overflow-hidden h-11 min-[450px]:h-14 sm:h-16 md:h-16 lg:h-20 flex items-center">
            <h2
              aria-label={currentGame.title}
              className={`font-black uppercase text-white tracking-tight leading-none font-display whitespace-nowrap overflow-hidden text-ellipsis text-balance ${
                currentGame.title.length > 20
                  ? 'text-2xl min-[450px]:text-[1.85rem] sm:text-[2.2rem] md:text-3xl lg:text-[2.6rem] xl:text-[3.1rem]'
                  : 'text-3xl min-[450px]:text-[2.35rem] sm:text-4xl md:text-5xl lg:text-[3.4rem] xl:text-6xl'
              }`}
            >
              <HackyText
                key={`${currentGame.id}-${cycleId}`}
                text={currentGame.title}
                trigger={true}
                speed={0.9}
              />
            </h2>
          </div>

          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-2 pt-2 border-t border-white/10 xl:h-11 xl:min-h-[44px] xl:max-h-[44px] xl:flex-nowrap w-full overflow-x-auto xl:overflow-x-visible no-scrollbar">
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 overflow-x-auto xl:overflow-x-visible w-full xl:w-auto pb-1 xl:pb-0 shrink-0 select-none no-scrollbar">
              {SHOWCASE_GAMES.map((game, idx) => {
                const isActive = idx === activeGameIndex
                const label = `0${idx + 1} / ${game.tabTitle || game.title}`
                const shortLabel = `0${idx + 1} / ${game.shortTabTitle || game.tabTitle || game.title}`
                return (
                  <LinkHover
                    key={game.id}
                    onClick={() => onGameChange(idx)}
                    aria-label={`Select game: ${game.title}`}
                    variant="inverted"
                    text={label}
                    shortText={shortLabel}
                    shortBreakpoint="desktop"
                    isActive={isActive}
                    scrambleOnClick={true}
                    className={`px-2 min-[400px]:px-2.5 sm:px-2.5 lg:px-3 py-1.5 sm:py-1.5 font-mono text-[11px] min-[400px]:text-[11.5px] min-[480px]:text-[12px] sm:text-[11px] lg:text-xs tracking-normal min-[400px]:tracking-wide sm:tracking-wider uppercase border transition-colors duration-[140ms] hover:duration-[100ms] ease-out bg-transparent shrink-0 whitespace-nowrap tabular-nums ${
                      isActive
                        ? 'text-white font-black border-white/60'
                        : 'text-white/40 font-normal border-white/15 hover:border-white/40 hover:text-white'
                    }`}
                  />
                )
              })}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 font-mono text-[11px] min-[400px]:text-[11.5px] min-[480px]:text-[12px] sm:text-[11px] lg:text-xs overflow-x-auto xl:overflow-x-visible w-full xl:w-auto xl:ml-auto shrink-0 select-none no-scrollbar">
              <span className="text-white/40 text-[9px] sm:text-[10px] tracking-widest uppercase hidden xl:inline mr-0.5">VIEW:</span>
              <LinkHover
                onClick={() => animateToSplit(1.0)}
                aria-label="Display comparison: 100% OLED mode"
                variant="inverted"
                text="100% OLED"
                isActive={targetPreset !== null ? targetPreset >= 0.98 : splitPos >= 0.98}
                scrambleOnClick={true}
                className={`px-2.5 sm:px-2.5 lg:px-2.5 xl:px-3 py-1.5 sm:py-1.5 font-mono text-[11px] min-[400px]:text-[11.5px] min-[480px]:text-[12px] sm:text-[11px] lg:text-xs tracking-wider uppercase border transition-colors duration-[140ms] hover:duration-[100ms] ease-out bg-transparent shrink-0 tabular-nums ${
                  (targetPreset !== null ? targetPreset >= 0.98 : splitPos >= 0.98)
                    ? 'text-white font-black border-white/60'
                    : 'text-white/40 font-normal border-white/15 hover:border-white/40 hover:text-white'
                }`}
              />
              <LinkHover
                onClick={() => animateToSplit(0.5)}
                aria-label="Display comparison: 50/50 Split mode"
                variant="inverted"
                text="50/50 SPLIT"
                shortText="50/50"
                shortBreakpoint="desktop"
                isActive={targetPreset !== null ? Math.abs(targetPreset - 0.5) < 0.05 : Math.abs(splitPos - 0.5) < 0.05}
                scrambleOnClick={true}
                className={`px-2.5 sm:px-2.5 lg:px-2.5 xl:px-3 py-1.5 sm:py-1.5 font-mono text-[11px] min-[400px]:text-[11.5px] min-[480px]:text-[12px] sm:text-[11px] lg:text-xs tracking-wider uppercase border transition-colors duration-[140ms] hover:duration-[100ms] ease-out bg-transparent shrink-0 tabular-nums ${
                  (targetPreset !== null ? Math.abs(targetPreset - 0.5) < 0.05 : Math.abs(splitPos - 0.5) < 0.05)
                    ? 'text-white font-black border-white/60'
                    : 'text-white/40 font-normal border-white/15 hover:border-white/40 hover:text-white'
                }`}
              />
              <LinkHover
                onClick={() => animateToSplit(0.0)}
                aria-label="Display comparison: 100% LCD mode"
                variant="inverted"
                text="100% LCD"
                isActive={targetPreset !== null ? targetPreset <= 0.02 : splitPos <= 0.02}
                scrambleOnClick={true}
                className={`px-2.5 sm:px-2.5 lg:px-2.5 xl:px-3 py-1.5 sm:py-1.5 font-mono text-[11px] min-[400px]:text-[11.5px] min-[480px]:text-[12px] sm:text-[11px] lg:text-xs tracking-wider uppercase border transition-colors duration-[140ms] hover:duration-[100ms] ease-out bg-transparent shrink-0 tabular-nums ${
                  (targetPreset !== null ? targetPreset <= 0.02 : splitPos <= 0.02)
                    ? 'text-white font-black border-white/60'
                    : 'text-white/40 font-normal border-white/15 hover:border-white/40 hover:text-white'
                }`}
              />

              <div className="flex items-center gap-1 sm:gap-1.5 pl-1.5 sm:pl-2 border-l border-white/15 shrink-0">
                <LinkHover
                  onClick={() => showcaseState.toggleShowBezelDiff()}
                  role="switch"
                  aria-checked={showBezelDiff}
                  aria-label={`Toggle 7.0 inch LCD bezel overlay: currently ${showBezelDiff ? 'On' : 'Off'}`}
                  variant="inverted"
                  text={`BEZELS: ${showBezelDiff ? '7.0" ON' : 'OFF'}`}
                  shortText={`BEZELS: ${showBezelDiff ? 'ON' : 'OFF'}`}
                  shortBreakpoint="sm"
                  isActive={showBezelDiff}
                  scrambleOnClick={true}
                  className={`px-2.5 sm:px-2.5 lg:px-2.5 xl:px-3 py-1.5 sm:py-1.5 font-mono text-[11px] min-[400px]:text-[11.5px] min-[480px]:text-[12px] sm:text-[11px] lg:text-xs tracking-wider uppercase border transition-colors duration-[140ms] hover:duration-[100ms] ease-out bg-transparent shrink-0 whitespace-nowrap ${
                    showBezelDiff
                      ? 'text-white font-black border-white/60'
                      : 'text-white/40 font-normal border-white/15 hover:border-white/40 hover:text-white'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
