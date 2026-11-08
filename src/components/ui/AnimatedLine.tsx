'use client'

import React, { useEffect, useRef } from 'react'
import { showcaseState } from '../3d/deckState'

interface AnimatedLineProps {
  trigger: boolean
  className?: string
  lineClassName?: string
  delay?: number // entrance delay in ms
  baseDuration?: number // duration in ms (default 480)
  reverseDuration?: number // duration for rollback in ms (defaults to baseDuration)
  origin?: 'left' | 'right'
  children?: React.ReactNode
}

/**
 * AnimatedLine Component for Cyberpunk / Swiss editorial layouts:
 * - Forward Entrance: Smoothly draws across from left to right (origin-left, scaleX: 0 -> 1)
 * - Reverse Rollback: Smoothly retracts from right to left back into origin (origin-left, scaleX: 1 -> 0)
 * - Velocity Adaptive: Automatically scales speed with showcaseState.speedFactor (up to 8x)
 * - Decoupled Children: Child badges/tags (like HackyText coordinates) are not squashed by scaleX
 * - Seamless Reversal: Mid-animation direction changes smoothly reverse from current progress
 */
export const AnimatedLine: React.FC<AnimatedLineProps> = ({
  trigger,
  className = '',
  lineClassName = '',
  delay = 100,
  baseDuration = 480,
  reverseDuration,
  origin = 'left',
  children,
}) => {
  const lineRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<number>(0)
  const isAnimatingRef = useRef<boolean>(false)
  const animFrameRef = useRef<number | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearTimers = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  // Smoothstep hermite interpolation for organic, mechanical movement
  const smooth = (t: number) => t * t * (3 - 2 * t)

  const updateDom = (p: number) => {
    if (!lineRef.current) return
    const eased = smooth(p)
    lineRef.current.style.transform = `scaleX(${eased})`
    lineRef.current.style.opacity = p > 0.001 ? '1' : '0'
  }

  useEffect(() => {
    clearTimers()

    if (trigger) {
      if (showcaseState.shutterPhase === 'closed' || showcaseState.shutterPhase === 'opening') {
        progressRef.current = 1
        updateDom(1)
        isAnimatingRef.current = false
        return
      }
      isAnimatingRef.current = true
      const isTransitionActive = showcaseState.portalPhase !== 'idle' || showcaseState.isTransitioning
      const factor = isTransitionActive ? 1.0 : Math.max(1, showcaseState.speedFactor || 1)
      const effectiveDelay = delay > 0 ? delay / factor : 0

      timeoutRef.current = setTimeout(() => {
        let lastTime = performance.now()

        const stepIn = (now: number) => {
          const dt = Math.min(100, now - lastTime)
          lastTime = now

          const isTransition = showcaseState.portalPhase !== 'idle' || showcaseState.isTransitioning
          const dynamicFactor = isTransition ? 1.0 : Math.max(1, showcaseState.speedFactor || 1)
          const stepDelta = (dt / baseDuration) * dynamicFactor

          progressRef.current = Math.min(1, progressRef.current + stepDelta)
          updateDom(progressRef.current)

          if (progressRef.current < 1) {
            animFrameRef.current = requestAnimationFrame(stepIn)
          } else {
            progressRef.current = 1
            updateDom(1)
            isAnimatingRef.current = false
            animFrameRef.current = null
          }
        }

        animFrameRef.current = requestAnimationFrame(stepIn)
      }, effectiveDelay)
    } else {
      // Reverse Rollback: Retract smoothly back into origin
      if (showcaseState.shutterPhase === 'closed') {
        progressRef.current = 0
        updateDom(0)
        isAnimatingRef.current = false
        return
      }
      if (progressRef.current > 0) {
        isAnimatingRef.current = true
        let lastTime = performance.now()

        const stepOut = (now: number) => {
          const dt = Math.min(100, now - lastTime)
          lastTime = now

          const isTransition = showcaseState.portalPhase !== 'idle' || showcaseState.isTransitioning
          const dynamicFactor = isTransition ? 1.0 : Math.max(1, showcaseState.speedFactor || 1)
          const effectiveDuration = reverseDuration !== undefined ? reverseDuration : baseDuration
          const stepDelta = (dt / effectiveDuration) * dynamicFactor

          progressRef.current = Math.max(0, progressRef.current - stepDelta)
          updateDom(progressRef.current)

          if (progressRef.current > 0) {
            animFrameRef.current = requestAnimationFrame(stepOut)
          } else {
            progressRef.current = 0
            updateDom(0)
            isAnimatingRef.current = false
            animFrameRef.current = null
          }
        }

        animFrameRef.current = requestAnimationFrame(stepOut)
      } else {
        progressRef.current = 0
        updateDom(0)
        isAnimatingRef.current = false
      }
    }

    return () => clearTimers()
  }, [trigger, delay, baseDuration, reverseDuration])

  return (
    <div className={`relative w-full my-4 flex items-center justify-between gap-3 ${className}`}>
      {/* Animated horizontal line bar */}
      <div className="flex-1 h-[1px] relative overflow-hidden">
        <div
          ref={lineRef}
          className={`w-full h-full bg-black/15 ${lineClassName}`}
          style={{
            transformOrigin: origin,
            transform: 'scaleX(0)',
            opacity: 0,
          }}
        />
      </div>
      {/* Decoupled child elements (e.g. LOC: 0.26 badge) */}
      {children}
    </div>
  )
}
