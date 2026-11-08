'use client'

import React, { useEffect, useRef } from 'react'

const TARGET_INSCRIPTION = '[POS: Y-MAX // CLAMP_SYS]'
const SCRAMBLE_GLYPHS = '0123456789ABCDEF!@#$%^&*<>[]{}/*+=~_X'

/**
 * Authentic High-Performance Cyberpunk Decryption Component.
 * 
 * 1. Default (idle / darkroom): Empty string — does NOT sit there statically by default.
 * 2. Closing ('closing'): Starts from the right margin with zero characters, grows towards
 *    the left character-by-character with a flickering matrix cipher head, and locks cleanly
 *    into [POS: Y-MAX // CLAMP_SYS] the moment the blades meet in the center.
 * 3. Closed ('closed'): Holds 100% rock-solid and stable.
 * 4. Opening ('opening'): Folds / rolls back up into the right margin from left to right,
 *    retracting away with cipher glyphs until it completely vanishes (empty string).
 */
function ShutterDecryption({ phase }: { phase: BladeShutterProps['phase'] }) {
  const textRef = useRef<HTMLSpanElement>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    const el = textRef.current
    if (!el) return

    // Cancel any previous animation
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }

    const totalChars = TARGET_INSCRIPTION.length

    // Default open states: strictly empty
    if (phase === 'idle' || phase === 'darkroom') {
      el.textContent = ''
      return
    }

    // Closed state: full rock-solid target text
    if (phase === 'closed') {
      el.textContent = TARGET_INSCRIPTION
      return
    }

    // 1. Closing: Grows from right edge to left (0 -> 26 chars) with scramble head
    if (phase === 'closing') {
      const duration = 600
      const startTime = performance.now()
      let lastTick = 0

      const renderGrowing = (progress: number) => {
        if (progress >= 1) return TARGET_INSCRIPTION
        // Starts with 2 matrix glyphs immediately at t=0, then smoothly grows to the left
        const currentLen = Math.max(2, Math.floor(progress * totalChars))
        const headLen = Math.min(2, currentLen)
        const lockedCount = Math.max(0, currentLen - headLen)
        let res = TARGET_INSCRIPTION.slice(0, lockedCount)

        for (let i = 0; i < headLen; i++) {
          const char = TARGET_INSCRIPTION[lockedCount + i]
          if (char === ' ') {
            res += ' '
          } else {
            res += SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)]
          }
        }
        return res
      }

      el.textContent = renderGrowing(0)

      const tickClosing = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(1, elapsed / duration)

        if (now - lastTick >= 28 || progress >= 1) {
          lastTick = now
          el.textContent = renderGrowing(progress)
        }

        if (progress < 1) {
          animRef.current = requestAnimationFrame(tickClosing)
        } else {
          el.textContent = TARGET_INSCRIPTION
          animRef.current = null
        }
      }

      animRef.current = requestAnimationFrame(tickClosing)
      return
    }

    // 2. Opening: Folds back up into right edge (retracts from left to right: 26 -> 0 chars)
    // Runs at high speed (260ms) so the text completely vanishes before the blades open
    if (phase === 'opening') {
      const duration = 260
      const startTime = performance.now()
      let lastTick = 0

      const renderFolding = (progress: number) => {
        if (progress >= 1) return ''
        const retractCount = Math.floor(progress * totalChars)
        const remainingLen = totalChars - retractCount
        if (remainingLen <= 1) return ''

        const headLen = Math.min(2, remainingLen)
        let res = ''

        // Flickering head at the retracting edge
        for (let i = 0; i < headLen; i++) {
          const char = TARGET_INSCRIPTION[retractCount + i]
          if (char === ' ') {
            res += ' '
          } else {
            res += SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)]
          }
        }

        // Remaining locked tail anchored to the right
        res += TARGET_INSCRIPTION.slice(retractCount + headLen)
        return res
      }

      el.textContent = renderFolding(0)

      const tickOpening = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(1, elapsed / duration)

        if (now - lastTick >= 16 || progress >= 1) {
          lastTick = now
          el.textContent = renderFolding(progress)
        }

        if (progress < 1) {
          animRef.current = requestAnimationFrame(tickOpening)
        } else {
          el.textContent = ''
          animRef.current = null
        }
      }

      animRef.current = requestAnimationFrame(tickOpening)
    }

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
        animRef.current = null
      }
    }
  }, [phase])

  return (
    <span
      id="shutter-decryption-text"
      ref={textRef}
      className="font-mono text-[10px] text-white/50 tracking-widest uppercase select-none inline-block text-right"
    >
      {/* Initial state is empty so nothing sits there by default */}
    </span>
  )
}

export interface BladeShutterProps {
  /**
   * 0 = fully open (light mode)
   * 1 = fully closed (shutter blades meet in center)
   * 2 = fully open to dark (reveals darkroom)
   */
  phase: 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom'
  onComplete?: () => void
}

/**
 * Blade Shutter Transition (Triple Mask & Curtain Shutter Logic)
 * 
 * Slices the viewport with upper and lower carbon shutter blades.
 * At the collision line, an encrypted terminal HUD protocol strip decodes
 * [POS: Y-MAX // CLAMP_SYS] before snapping open
 * to reveal the pure abyss-black OLED Darkroom.
 */
export function BladeShutter({ phase }: BladeShutterProps) {
  const isClosed = phase === 'closing' || phase === 'closed'

  return (
    <div 
      className="fixed inset-0 z-[70] pointer-events-none overflow-hidden"
      style={{
        pointerEvents: isClosed ? 'auto' : 'none',
      }}
    >
      {/* Upper Shutter Blade */}
      <div 
        className="absolute top-0 left-0 right-0 h-[calc(50%+4px)] bg-[#020202] flex flex-col justify-end border-b border-[#ffffff]/20 will-change-transform"
        style={{
          transform: isClosed ? 'translateY(0%)' : 'translateY(-101%)',
          transition: 'transform 1.05s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Subtle grid on shutter */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }}
        />

        {/* Top Blade Edge Marking: ONLY [POS: Y-MAX // CLAMP_SYS] with Cyberpunk Decryption */}
        <div className="p-6 flex justify-end items-center select-none min-h-[32px]">
          <ShutterDecryption phase={phase} />
        </div>
      </div>

      {/* Lower Shutter Blade */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-[calc(50%+4px)] bg-[#020202] flex flex-col justify-start border-t border-[#ffffff]/20 will-change-transform"
        style={{
          transform: isClosed ? 'translateY(0%)' : 'translateY(101%)',
          transition: 'transform 1.05s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Subtle grid on shutter */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }}
        />
      </div>
    </div>
  )
}
