'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { showcaseState } from '../3d/deckState'
import { soundManager } from '../../audio/soundEngine'

const SCRAMBLE_GLYPHS = '0123456789ABCDEF!@#$%^&*<>[]{}/*+=~_X'

interface HackyTextProps {
  text: string
  className?: string
  characters?: string
  speed?: number
  reverseSpeed?: number
  trigger?: boolean
  writeInOnHover?: boolean
  silent?: boolean
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'span' | 'div' | 'p'
  onComplete?: () => void
  style?: React.CSSProperties
  delay?: number
  children?: React.ReactNode
}

/**
 * Cyberpunk / Swiss Editorial HackyText Decrypt Scramble component:
 * 1. Forward Reveal (trigger = true):
 *    Decodes character-by-character with trailing scramble glyphs, locks at 100% (zero jitter).
 * 2. Reverse Decode (trigger = false):
 *    Smoothly encrypts backwards back into empty space at symmetric speed.
 * 3. Dynamic Velocity Scaling:
 *    Standard leisurely scroll maintains standard duration.
 *    Fast scrolling dynamically accelerates decoding (up to 8x) so text never cuts off abruptly.
 * 4. Bidirectional Continuity:
 *    Changing scroll direction mid-animation seamlessly reverses from the exact current character.
 */
export const HackyText: React.FC<HackyTextProps> = ({
  text,
  className = '',
  characters = SCRAMBLE_GLYPHS,
  speed = 1,
  reverseSpeed,
  trigger = true,
  writeInOnHover = false,
  silent = false,
  as: Component = 'span',
  onComplete,
  style,
  delay = 0,
}) => {
  const hasAnimatedRef = useRef<boolean>(writeInOnHover ? true : false)
  const isAnimatingRef = useRef<boolean>(false)
  // Unified progress from 0 (empty) to 1 (fully decoded)
  const progressRef = useRef<number>(writeInOnHover ? 1 : 0)
  const lastRevealedRef = useRef<number>(writeInOnHover ? text.length : 0)

  const [displayText, setDisplayText] = useState<string>(() => {
    if (writeInOnHover) return text
    return ''
  })
  const displayTextRef = useRef<string>(displayText)
  displayTextRef.current = displayText
  const animFrameRef = useRef<number | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearTimers = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Helper to render text at current progress & trigger character-specific tactile acoustic feedback
  const renderProgress = useCallback(
    (progress: number) => {
      const totalChars = text.length
      const clampedProgress = Math.max(0, Math.min(1, progress))
      const at = Math.floor(clampedProgress * totalChars)

      // Audio: fire tactile key sound specifically when characters advance or erase
      if (!silent && at !== lastRevealedRef.current) {
        if (at > lastRevealedRef.current) {
          // Forward reveal typing
          const count = at - lastRevealedRef.current
          if (count <= 3) {
            for (let i = lastRevealedRef.current; i < at; i++) {
              const char = text[i]
              const staggerSec = (i - lastRevealedRef.current) * 0.018
              soundManager.playHackyTick(char, {
                index: i,
                total: totalChars,
                delaySec: staggerSec,
                isReverse: false,
              })
            }
          } else {
            // High velocity rapid scroll: schedule spaced keyclicks across interval to avoid audio buildup
            const indices = [lastRevealedRef.current, Math.floor((lastRevealedRef.current + at) / 2), at - 1]
            indices.forEach((idx, step) => {
              const char = text[idx]
              soundManager.playHackyTick(char, {
                index: idx,
                total: totalChars,
                delaySec: step * 0.015,
                isReverse: false,
                intensity: 0.85,
              })
            })
          }
        } else if (at < lastRevealedRef.current) {
          // Reverse erasure (animateOut)
          const count = lastRevealedRef.current - at
          if (count <= 2) {
            for (let i = lastRevealedRef.current - 1; i >= at; i--) {
              const char = text[i]
              soundManager.playHackyTick(char, {
                index: i,
                total: totalChars,
                isReverse: true,
              })
            }
          } else {
            soundManager.playHackyTick(text[at], {
              index: at,
              total: totalChars,
              isReverse: true,
              intensity: 0.7,
            })
          }
        }
        lastRevealedRef.current = at
      } else if (silent) {
        lastRevealedRef.current = at
      }

      if (progress >= 1) {
        return text
      }
      if (progress <= 0) {
        return ''
      }
      const lines = text.split('\n')
      let remainingAt = at
      const renderedLines: string[] = []

      for (const line of lines) {
        const revealedPart = line.substring(0, Math.max(0, remainingAt))
        remainingAt -= line.length
        const scrambleLength = Math.min(3, Math.max(0, line.length - revealedPart.length))
        let scrambledLine = revealedPart
        if (scrambleLength > 0 && revealedPart.length < line.length) {
          for (let i = 0; i < scrambleLength; i++) {
            if (line[revealedPart.length + i] === ' ') {
              scrambledLine += ' '
            } else {
              const randomIndex = Math.floor(Math.random() * characters.length)
              scrambledLine += characters.substring(randomIndex, randomIndex + 1)
            }
          }
        }
        renderedLines.push(scrambledLine)
      }
      return renderedLines.join('\n')
    },
    [text, characters, silent]
  )

  const animateIn = useCallback(
    (inDelay = delay, customSpeedMultiplier = 1) => {
      clearTimers()
      isAnimatingRef.current = true

      const isTransitionActive = showcaseState.portalPhase !== 'idle' || showcaseState.isTransitioning
      const factor = isTransitionActive ? 1.0 : (showcaseState.speedFactor || 1)
      const effectiveDelay = inDelay > 0 ? inDelay / factor : 0

      timeoutRef.current = setTimeout(() => {
        const totalChars = text.length
        const currentSpeed = speed * customSpeedMultiplier
        const baseDuration = Math.max(200, (0.018 * totalChars + 0.32) * currentSpeed * 1000)
        let lastFrameTime: number | null = null

        const step = (now: number) => {
          if (lastFrameTime === null) {
            lastFrameTime = now
            animFrameRef.current = requestAnimationFrame(step)
            return
          }
          const dt = Math.min(100, now - lastFrameTime)
          lastFrameTime = now

          // Dynamic speed: standard at 1.0, scales up to 8.0x when scrolling fast in idle
          const isTransition = showcaseState.portalPhase !== 'idle' || showcaseState.isTransitioning
          const dynamicFactor = isTransition ? 1.0 : Math.max(1, showcaseState.speedFactor || 1)
          const stepDelta = (dt / baseDuration) * dynamicFactor

          progressRef.current = Math.min(1, progressRef.current + stepDelta)

          if (progressRef.current < 1) {
            setDisplayText(renderProgress(progressRef.current))
            animFrameRef.current = requestAnimationFrame(step)
          } else {
            progressRef.current = 1
            if (!silent && lastRevealedRef.current < text.length) {
              for (let i = lastRevealedRef.current; i < text.length; i++) {
                soundManager.playHackyTick(text[i], {
                  index: i,
                  total: text.length,
                  isReverse: false,
                })
              }
              lastRevealedRef.current = text.length
            } else if (silent) {
              lastRevealedRef.current = text.length
            }
            setDisplayText(text)
            hasAnimatedRef.current = true
            isAnimatingRef.current = false
            animFrameRef.current = null
            if (onComplete) onComplete()
          }
        }

        animFrameRef.current = requestAnimationFrame(step)
      }, effectiveDelay)
    },
    [text, speed, onComplete, delay, clearTimers, renderProgress, silent]
  )

  const animateOut = useCallback(() => {
    clearTimers()
    isAnimatingRef.current = true
    hasAnimatedRef.current = false

    const totalChars = text.length
    const currentSpeed = reverseSpeed !== undefined ? reverseSpeed : speed
    const baseDuration = Math.max(260, (0.018 * totalChars + 0.32) * currentSpeed * 1000)
    let lastFrameTime: number | null = null

    const stepOut = (now: number) => {
      if (lastFrameTime === null) {
        lastFrameTime = now
        // Immediately kick off the first reverse glitch glyph
        setDisplayText(renderProgress(0.92))
        animFrameRef.current = requestAnimationFrame(stepOut)
        return
      }
      const dt = Math.min(100, now - lastFrameTime)
      lastFrameTime = now

      // Dynamic speed: standard at 1.0, scales up to 8.0x when scrolling fast in idle
      const isTransition = showcaseState.portalPhase !== 'idle' || showcaseState.isTransitioning
      const dynamicFactor = isTransition ? 1.0 : Math.max(1, showcaseState.speedFactor || 1)
      const stepDelta = (dt / baseDuration) * dynamicFactor

      progressRef.current = Math.max(0, progressRef.current - stepDelta)

      if (progressRef.current > 0) {
        setDisplayText(renderProgress(progressRef.current))
        animFrameRef.current = requestAnimationFrame(stepOut)
      } else {
        progressRef.current = 0
        lastRevealedRef.current = 0
        setDisplayText('')
        hasAnimatedRef.current = false
        isAnimatingRef.current = false
        animFrameRef.current = null
      }
    }

    animFrameRef.current = requestAnimationFrame(stepOut)
  }, [text, speed, reverseSpeed, clearTimers, renderProgress])

  useEffect(() => {
    if (trigger) {
      if (showcaseState.shutterPhase === 'closed' || showcaseState.shutterPhase === 'opening') {
        clearTimers()
        progressRef.current = 1
        lastRevealedRef.current = text.length
        setDisplayText(text)
        hasAnimatedRef.current = true
        isAnimatingRef.current = false
        if (onComplete) onComplete()
        return
      }
      if (!hasAnimatedRef.current || progressRef.current < 1 || !displayTextRef.current) {
        animateIn(delay)
      }
    } else {
      if (showcaseState.shutterPhase === 'closed') {
        clearTimers()
        progressRef.current = 0
        lastRevealedRef.current = 0
        setDisplayText('')
        hasAnimatedRef.current = false
        isAnimatingRef.current = false
        return
      }
      if (hasAnimatedRef.current || isAnimatingRef.current || progressRef.current > 0 || Boolean(displayTextRef.current)) {
        animateOut()
      } else {
        progressRef.current = 0
        lastRevealedRef.current = 0
        setDisplayText('')
        hasAnimatedRef.current = false
        isAnimatingRef.current = false
      }
    }

    return () => clearTimers()
  }, [trigger, animateIn, animateOut, delay, clearTimers, text, onComplete])

  const handleMouseEnter = () => {
    if (writeInOnHover && !isAnimatingRef.current) {
      lastRevealedRef.current = 0
      progressRef.current = 0
      animateIn(0, 0.65)
    }
  }

  const isVisible = hasAnimatedRef.current || isAnimatingRef.current || displayText.length > 0

  return (
    <Component
      className={`hacky-text inline-block select-none ${className}`}
      onMouseEnter={handleMouseEnter}
      style={{
        whiteSpace: 'pre-line',
        minHeight: '1em',
        visibility: isVisible ? 'visible' : 'hidden',
        ...style,
      }}
    >
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden="true">
        {hasAnimatedRef.current && !isAnimatingRef.current ? text : displayText}
      </span>
    </Component>
  )
}
