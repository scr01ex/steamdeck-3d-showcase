'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSound } from '../../audio/useSound'
import { LinkHover } from './LinkHover'
import gsap from 'gsap'

const SCRAMBLE_CHARS = '0123456789ABCDEF!@#$%^&*<>[]{}/*+=~_X'

function useScramble(targetText: string, isHovered: boolean) {
  const [scrambled, setScrambled] = useState<string | null>(null)

  useEffect(() => {
    if (!isHovered) return

    const duration = 220
    const startTime = performance.now()
    let rafId: number

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      const at = Math.floor(progress * targetText.length)

      let result = ''
      for (let i = 0; i < targetText.length; i++) {
        if (i < at) {
          result += targetText[i]
        } else {
          result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        }
      }
      setScrambled(result)

      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        setScrambled(targetText)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(rafId)
      setScrambled(null)
    }
  }, [isHovered, targetText])

  return isHovered && scrambled !== null ? scrambled : targetText
}

function LiquidAudioMorphIcon({ isMuted }: { isMuted: boolean }) {
  const uniqueId = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const filterId = `liquid-goo-${uniqueId}`

  const svgRef = useRef<SVGSVGElement>(null)
  const blurRef = useRef<SVGFEGaussianBlurElement>(null)
  const matrixRef = useRef<SVGFEColorMatrixElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const shape0Ref = useRef<SVGRectElement>(null)
  const shape1Ref = useRef<SVGPathElement>(null)
  const shape2Ref = useRef<SVGRectElement>(null)
  const shape3Ref = useRef<SVGRectElement>(null)

  const progressRef = useRef(isMuted ? 0 : 1)
  const isTransitioningRef = useRef(false)
  const tweenRef = useRef<gsap.core.Tween | null>(null)
  const isInitialMount = useRef(true)

  // Direct 120 FPS DOM render function based on morph progress p and continuous performance time now
  const renderFrame = useCallback((p: number, now: number) => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    // Organic liquid gooey filter intensity:
    // stdDeviation peaks at p=0.5 (~1.65px), smoothly drops to exactly 0 at p=0 and p=1
    const gooFactor = Math.sin(p * Math.PI)
    if (blurRef.current) {
      const stdDev = gooFactor * 1.65
      blurRef.current.setAttribute('stdDeviation', stdDev.toFixed(2))
    }

    // Dynamic Color Matrix:
    // At gooFactor = 0 (p=0 and p=1), matrix is mathematically EXACT Identity: [0 0 0 1 0]
    // At gooFactor = 1 (p=0.5), matrix reaches maximum liquid threshold: [0 0 0 18 -7]
    // Eliminates any micro-lag, layer invalidation, or visual snap between morph and final shape!
    if (matrixRef.current) {
      const mult = lerp(1.0, 18.0, gooFactor)
      const sub = lerp(0.0, -7.0, gooFactor)
      matrixRef.current.setAttribute(
        'values',
        `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${mult.toFixed(2)} ${sub.toFixed(2)}`
      )
    }

    // Liquid droplet scale wobble:
    if (groupRef.current) {
      const wobble = 1 + gooFactor * 0.12
      groupRef.current.style.transform = `scale(${wobble.toFixed(3)})`
      groupRef.current.style.transformOrigin = '8.5px 7px'
    }

    // Live audio wave modulation:
    // Dynamic height modulation blends smoothly across morph transitions.
    const t = now * 0.0055
    const bounceWeight = Math.max(0, Math.min(1, p))

    // Live wave heights (ranges: Bar0: 4.2..9.0, Bar1: 5.5..11.0, Bar2: 6.0..11.8, Bar3: 4.0..8.6)
    const h0_live = 4.2 + (Math.sin(t * 2.1) * 0.5 + 0.5) * 4.8
    const h1_live = 5.5 + (Math.sin(t * 2.7 + 1.2) * 0.5 + 0.5) * 5.5
    const h2_live = 6.0 + (Math.sin(t * 1.9 + 2.4) * 0.5 + 0.5) * 5.8
    const h3_live = 4.0 + (Math.sin(t * 2.4 + 3.8) * 0.5 + 0.5) * 4.6

    // Target dynamic heights blending live wave with resting baseline
    const targetH0 = lerp(6.0, h0_live, bounceWeight)
    const targetY0 = 12.0 - targetH0

    const targetH1 = lerp(9.0, h1_live, bounceWeight)
    const targetY1 = 12.0 - targetH1

    const targetH2 = lerp(10.0, h2_live, bounceWeight)
    const targetCY2 = 12.0 - targetH2 / 2

    const targetH3 = lerp(8.0, h3_live, bounceWeight)
    const targetCY3 = 12.0 - targetH3 / 2

    // Shape 0: Speaker back box <-> Equalizer Bar 0
    if (shape0Ref.current) {
      const s0x = lerp(1.0, 1.8, p)
      const s0y = lerp(4.5, targetY0, p)
      const s0w = lerp(3.2, 2.0, p)
      const s0h = lerp(5.0, targetH0, p)
      const s0rx = lerp(0.5, 1.0, p)
      shape0Ref.current.setAttribute('x', s0x.toFixed(2))
      shape0Ref.current.setAttribute('y', s0y.toFixed(2))
      shape0Ref.current.setAttribute('width', s0w.toFixed(2))
      shape0Ref.current.setAttribute('height', s0h.toFixed(2))
      shape0Ref.current.setAttribute('rx', s0rx.toFixed(2))
    }

    // Shape 1: Speaker horn flare <-> Equalizer Bar 1
    if (shape1Ref.current) {
      const p1_tlx = lerp(3.6, 5.3, p)
      const p1_tly = lerp(4.5, targetY1, p)
      const p1_trx = lerp(7.85, 7.3, p)
      const p1_try = lerp(2.0, targetY1, p)
      const p1_brx = lerp(7.85, 7.3, p)
      const p1_bry = 12.0
      const p1_blx = lerp(3.6, 5.3, p)
      const p1_bly = lerp(9.5, 12.0, p)
      const d = `M ${p1_tlx.toFixed(2)} ${p1_tly.toFixed(2)} L ${p1_trx.toFixed(2)} ${p1_try.toFixed(2)} L ${p1_brx.toFixed(2)} ${p1_bry.toFixed(2)} L ${p1_blx.toFixed(2)} ${p1_bly.toFixed(2)} Z`
      shape1Ref.current.setAttribute('d', d)
    }

    // Shape 2: Mute Slash \ <-> Equalizer Bar 2
    if (shape2Ref.current) {
      const cx = lerp(13.25, 9.8, p)
      const cy = lerp(7.0, targetCY2, p)
      const len = lerp(6.7, targetH2, p)
      const thick = lerp(1.6, 2.0, p)
      const angle = lerp(48, 0, p)
      const rx = lerp(0.8, 1.0, p)
      shape2Ref.current.setAttribute('x', (-thick / 2).toFixed(2))
      shape2Ref.current.setAttribute('y', (-len / 2).toFixed(2))
      shape2Ref.current.setAttribute('width', thick.toFixed(2))
      shape2Ref.current.setAttribute('height', len.toFixed(2))
      shape2Ref.current.setAttribute('rx', rx.toFixed(2))
      shape2Ref.current.setAttribute(
        'transform',
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${angle.toFixed(2)})`
      )
    }

    // Shape 3: Mute Slash / <-> Equalizer Bar 3
    if (shape3Ref.current) {
      const cx = lerp(13.25, 13.3, p)
      const cy = lerp(7.0, targetCY3, p)
      const len = lerp(6.7, targetH3, p)
      const thick = lerp(1.6, 2.0, p)
      const angle = lerp(-48, 0, p)
      const rx = lerp(0.8, 1.0, p)
      shape3Ref.current.setAttribute('x', (-thick / 2).toFixed(2))
      shape3Ref.current.setAttribute('y', (-len / 2).toFixed(2))
      shape3Ref.current.setAttribute('width', thick.toFixed(2))
      shape3Ref.current.setAttribute('height', len.toFixed(2))
      shape3Ref.current.setAttribute('rx', rx.toFixed(2))
      shape3Ref.current.setAttribute(
        'transform',
        `translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${angle.toFixed(2)})`
      )
    }
  }, [])

  const rafIdRef = useRef<number | null>(null)

  const startLoop = useCallback(() => {
    if (rafIdRef.current !== null) return

    const loop = (now: number) => {
      renderFrame(progressRef.current, now)

      // Keep running if unmuted (progress > 0.0001) or currently in transition
      if (progressRef.current > 0.0001 || isTransitioningRef.current) {
        rafIdRef.current = requestAnimationFrame(loop)
      } else {
        rafIdRef.current = null
      }
    }
    rafIdRef.current = requestAnimationFrame(loop)
  }, [renderFrame])

  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  // Trigger liquid morph animation whenever isMuted toggles
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      renderFrame(isMuted ? 0 : 1, performance.now())
      if (!isMuted) {
        startLoop()
      }
      return
    }

    const target = isMuted ? 0 : 1
    if (tweenRef.current) {
      tweenRef.current.kill()
    }

    isTransitioningRef.current = true
    startLoop()

    const proxy = { p: progressRef.current }

    // Smooth power2.inOut morphing
    tweenRef.current = gsap.to(proxy, {
      p: target,
      duration: 0.44,
      ease: 'power2.inOut',
      onUpdate: () => {
        progressRef.current = proxy.p
      },
      onComplete: () => {
        progressRef.current = target
        isTransitioningRef.current = false
        // Final settle frame
        renderFrame(target, performance.now())
      },
    })

    return () => {
      if (tweenRef.current) tweenRef.current.kill()
    }
  }, [isMuted, renderFrame, startLoop])

  // Cleanup loop on unmount
  useEffect(() => {
    return () => {
      stopLoop()
      if (tweenRef.current) tweenRef.current.kill()
    }
  }, [stopLoop])

  return (
    <svg
      ref={svgRef}
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        {/* Organic Liquid Gooey Filter: smoothly transitions between Identity matrix and Gooey Matrix */}
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur ref={blurRef} in="SourceGraphic" stdDeviation="0" result="blur" />
          <feColorMatrix
            ref={matrixRef}
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
          />
        </filter>
      </defs>

      {/* Morphing Shapes Container */}
      <g
        ref={groupRef}
        filter={`url(#${filterId})`}
      >
        {/* Shape 0: Speaker box <-> Bar 0 */}
        <rect
          ref={shape0Ref}
          x="1"
          y="4.5"
          width="3.2"
          height="5"
          rx="0.5"
          fill="currentColor"
        />

        {/* Shape 1: Speaker horn <-> Bar 1 */}
        <path
          ref={shape1Ref}
          d="M 3.6 4.5 L 7.85 2 L 7.85 12 L 3.6 9.5 Z"
          fill="currentColor"
          strokeLinejoin="round"
        />

        {/* Shape 2: Slash \ <-> Bar 2 */}
        <rect
          ref={shape2Ref}
          x="-0.8"
          y="-3.35"
          width="1.6"
          height="6.7"
          rx="0.8"
          transform="translate(13.25, 7) rotate(48)"
          fill="currentColor"
        />

        {/* Shape 3: Slash / <-> Bar 3 */}
        <rect
          ref={shape3Ref}
          x="-0.8"
          y="-3.35"
          width="1.6"
          height="6.7"
          rx="0.8"
          transform="translate(13.25, 7) rotate(-48)"
          fill="currentColor"
        />
      </g>
    </svg>
  )
}

export interface SoundToggleProps {
  variant?: 'light' | 'dark'
  className?: string
  isHovered?: boolean
  onHoverChange?: (hovered: boolean) => void
}

export function SoundToggle({
  variant = 'light',
  className = '',
  isHovered: controlledHovered,
  onHoverChange,
}: SoundToggleProps) {
  const { isMuted, toggleMute } = useSound()
  const [internalHovered, setInternalHovered] = useState(false)

  const isControlled = controlledHovered !== undefined
  const isHovered = isControlled ? controlledHovered : internalHovered

  const handleHoverChange = (hovered: boolean) => {
    if (!isControlled) {
      setInternalHovered(hovered)
    }
    if (onHoverChange) {
      onHoverChange(hovered)
    }
  }

  const scrambledAudio = useScramble('AUDIO', isHovered)

  // Global keyboard shortcut 'M' toggles mute (registered once by light variant to prevent duplicate execution)
  useEffect(() => {
    if (variant !== 'light') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleMute()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [variant, toggleMute])

  const isLight = variant === 'light'

  const crosshairClass = isLight
    ? {
        tl: 'hud-crosshair-tl',
        tr: 'hud-crosshair-tr',
        bl: 'hud-crosshair-bl',
        br: 'hud-crosshair-br',
      }
    : {
        tl: 'hud-crosshair-tl-white',
        tr: 'hud-crosshair-tr-white',
        bl: 'hud-crosshair-bl-white',
        br: 'hud-crosshair-br-white',
      }

  return (
    <div
      data-sound-toggle="true"
      className={`relative p-[3px] box-border pointer-events-auto flex items-center justify-center ${className}`}
    >
      {/* HUD Corner Crosshairs */}
      <span className={crosshairClass.tl} aria-hidden="true" />
      <span className={crosshairClass.tr} aria-hidden="true" />
      <span className={crosshairClass.bl} aria-hidden="true" />
      <span className={crosshairClass.br} aria-hidden="true" />

      <LinkHover
        role="switch"
        aria-checked={!isMuted}
        aria-label={`Sound is ${isMuted ? 'muted' : 'active'}. Press M or click to toggle audio.`}
        variant={isLight ? 'outline' : 'inverted'}
        isHovered={isHovered}
        onHoverChange={handleHoverChange}
        onClick={toggleMute}
        className={`w-full h-full px-2.5 sm:px-3 flex items-center justify-center font-mono text-[10px] sm:text-[11px] font-bold tracking-wider uppercase border transition-colors duration-150 ${
          isLight
            ? 'bg-white text-black border-black/30 hover:border-black shadow-none'
            : 'bg-black text-white border-white/30 hover:border-white shadow-none'
        }`}
      >
        <span className="flex items-center justify-center gap-1.5 sm:gap-2 pointer-events-none">
          {/* Audio Label with Matrix Scramble on Hover */}
          <span className="tracking-wider whitespace-nowrap">
            {scrambledAudio}
          </span>

          {/* Dynamic Sound State Indicator: Liquid Gooey Morphing Audio Icon */}
          <span className="w-[18px] h-3.5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <LiquidAudioMorphIcon isMuted={isMuted} />
          </span>
        </span>
      </LinkHover>
    </div>
  )
}
