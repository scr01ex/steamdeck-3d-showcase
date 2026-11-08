'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { sequenceProgressState, getSteamScreenController } from '../3d/SteamScreenTexture'
import { planetPreloadState } from '../3d/planetPreloadState'
import { showcaseState } from '../3d/deckState'

export function LoadingScreen() {
  const { active: modelActive, loaded: modelLoaded, total: modelTotal } = useProgress()
  const [seqProgress, setSeqProgress] = useState(sequenceProgressState.progress)
  const [planetProgress, setPlanetProgress] = useState(planetPreloadState.progress)
  const [isPlanetReady, setIsPlanetReady] = useState(planetPreloadState.isReady)
  const [displayProgress, setDisplayProgress] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [shouldRender, setShouldRender] = useState(true)

  const isReadyTriggered = useRef(false)
  const maxTargetRef = useRef(0)
  const displayProgressRef = useRef(0)

  // Lock scroll interactions until preloader assets complete
  useEffect(() => {
    if (showcaseState.isReady) return

    showcaseState.offset = 0
    if (showcaseState.scrollEl) {
      showcaseState.scrollEl.scrollTop = 0
    }

    if (typeof window !== 'undefined') {
      try {
        window.history.scrollRestoration = 'manual'
      } catch (_) {}
      window.scrollTo(0, 0)

      const preventScroll = (e: Event) => {
        if (!showcaseState.isReady) {
          e.preventDefault()
          e.stopPropagation()
        }
      }

      const preventKeyScroll = (e: KeyboardEvent) => {
        if (!showcaseState.isReady) {
          const keys = ['Space', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']
          if (keys.includes(e.code) || keys.includes(e.key)) {
            e.preventDefault()
            e.stopPropagation()
          }
        }
      }

      window.addEventListener('wheel', preventScroll, { passive: false, capture: true })
      window.addEventListener('touchmove', preventScroll, { passive: false, capture: true })
      window.addEventListener('keydown', preventKeyScroll, { capture: true })

      return () => {
        window.removeEventListener('wheel', preventScroll, { capture: true })
        window.removeEventListener('touchmove', preventScroll, { capture: true })
        window.removeEventListener('keydown', preventKeyScroll, { capture: true })
      }
    }
  }, [])

  // Preload screen sequence and planet ecosystem in parallel with 3D canvas initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      getSteamScreenController()
      planetPreloadState.init()
    }

    const unsubSeq = sequenceProgressState.subscribe(() => {
      setSeqProgress(sequenceProgressState.progress)
    })
    const unsubPlanet = planetPreloadState.subscribe(() => {
      setPlanetProgress(planetPreloadState.progress)
      setIsPlanetReady(planetPreloadState.isReady)
    })
    return () => {
      unsubSeq()
      unsubPlanet()
    }
  }, [])

  // Safe model progress calculation (avoids Drei's 0 || 100 bug)
  let safeModelPct = 0
  if (modelTotal > 0 && modelLoaded > 0) {
    safeModelPct = Math.min(100, Math.max(0, (modelLoaded / modelTotal) * 100))
  } else if (!modelActive && modelLoaded > 0 && modelLoaded >= modelTotal) {
    safeModelPct = 100
  }

  const seqPct = seqProgress || 0
  const planetPct = planetProgress || 0

  const isModelReady = (!modelActive && modelLoaded > 0 && modelLoaded >= modelTotal) || safeModelPct >= 100
  const isSeqReady = sequenceProgressState.isComplete || sequenceProgressState.loaded >= 100 || seqProgress >= 90
  const isPlanetLoaded = isPlanetReady || planetPct >= 80
  const isAllLoaded = isModelReady && isSeqReady && isPlanetLoaded

  // Weighted asset readiness: 50% Steam Deck GLTF, 40% screen sequence, 10% posters
  let rawProgress = Math.min(100, Math.round(safeModelPct * 0.50 + seqPct * 0.40 + planetPct * 0.10))
  if (isAllLoaded) {
    rawProgress = 100
  }

  // Strictly monotonic: target progress can only advance forward
  const currentTarget = Math.max(maxTargetRef.current, rawProgress)
  maxTargetRef.current = currentTarget

  const triggerReady = () => {
    // Keep loader active until 3D model is compiled and progress reaches 100%
    if (!isModelReady || displayProgressRef.current < 99.5) return
    if (isReadyTriggered.current || showcaseState.isReady) return
    isReadyTriggered.current = true

    if (showcaseState.scrollEl) {
      showcaseState.scrollEl.scrollTop = 0
    }
    showcaseState.offset = 0
    showcaseState.isReady = true
    setIsReady(true)
    setTimeout(() => setShouldRender(false), 700)

    // Preload heavy background video assets for scenes 3 & 4 while user views scene 1
    planetPreloadState.startBackgroundVideoPreload()
  }

  // Smooth 60 FPS unified progress animation: text and bar advance together seamlessly
  useEffect(() => {
    let animId: number
    const updateVisualProgress = () => {
      const current = displayProgressRef.current
      const target = maxTargetRef.current

      if (current < target) {
        const diff = target - current
        const step = Math.max(0.4, diff * 0.12)
        const next = Math.min(target, current + step)
        displayProgressRef.current = next
        setDisplayProgress(next)
      }

      // Once all assets are loaded and the bar has fully reached 100%, trigger completion
      if (isAllLoaded && displayProgressRef.current >= 99.5) {
        if (!isReadyTriggered.current && !showcaseState.isReady) {
          const timer = setTimeout(() => {
            triggerReady()
          }, 200)
          return () => clearTimeout(timer)
        }
      }

      if (displayProgressRef.current < 100 || !showcaseState.isReady) {
        animId = requestAnimationFrame(updateVisualProgress)
      }
    }

    animId = requestAnimationFrame(updateVisualProgress)
    return () => cancelAnimationFrame(animId)
  }, [isAllLoaded, currentTarget])

  // Safety fallback timeout: if model is loaded and >=80% frames decoded, advance target to 100%
  useEffect(() => {
    if (isReady || showcaseState.isReady || isReadyTriggered.current) return
    const safetyTimer = setTimeout(() => {
      if (!isReadyTriggered.current && !showcaseState.isReady) {
        if (isModelReady && seqProgress >= 80) {
          maxTargetRef.current = 100
        }
      }
    }, 4000)
    return () => clearTimeout(safetyTimer)
  }, [isReady, isModelReady, seqProgress])

  if (!shouldRender) return null

  const displayInt = Math.round(displayProgress)

  return (
    <div 
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black select-none touch-none overscroll-none transition-opacity duration-700 ease-out ${
        isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col max-w-sm w-full px-6">
        <div className="flex items-baseline justify-between w-full font-mono mb-3">
          <span className="text-xs text-neutral-300 tracking-[0.22em] uppercase whitespace-nowrap">
            INITIALIZING 3D ENGINE…
          </span>
          <span className="text-[11px] text-neutral-400 tracking-[0.18em] tabular-nums">
            {displayInt}%
          </span>
        </div>

        <div 
          role="progressbar"
          aria-valuenow={displayInt}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="3D engine loading progress"
          className="w-full h-[1px] bg-neutral-800 relative overflow-hidden"
        >
          <div 
            className="h-full bg-white will-change-[width]"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
