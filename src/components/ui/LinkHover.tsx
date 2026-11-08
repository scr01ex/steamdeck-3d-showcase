'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import gsap from 'gsap'
import { soundManager } from '../../audio/soundEngine'
import { showcaseState } from '../3d/deckState'
import { isMouseOverNavTab } from './navigationUtils'

const SCRAMBLE_GLYPHS = '0123456789ABCDEF!@#$%^&*<>[]{}/*+=~_X'



export interface LinkHoverProps {
  children?: React.ReactNode
  text?: string
  shortText?: string
  shortBreakpoint?: 'desktop' | 'md' | 'sm'
  href?: string
  target?: string
  rel?: string
  onClick?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement | HTMLAnchorElement>
  role?: string
  'aria-checked'?: boolean | 'true' | 'false' | 'mixed'
  tabIndex?: number
  className?: string
  bgFillColor?: string
  buttonRef?: React.Ref<HTMLButtonElement | HTMLAnchorElement>
  scrambleOnHover?: boolean
  scrambleOnClick?: boolean
  variant?: 'outline' | 'solid' | 'inverted'
  isHovered?: boolean
  isActive?: boolean
  onHoverChange?: (hovered: boolean) => void
  'aria-label'?: string
  dataNavTab?: number
  'data-nav-tab'?: number | string
}

/**
 * Authentic HUD Stencil LinkHover Component:
 * 1. True Stencil Aperture:
 *    - Layer 1 (Base): Normal dark / active text sits on the canvas (z-index: 1).
 *    - Layer 2 (Mask): Sliding pill (-101% -> 0% -> 101%) with counter-translated text (z-index: 2).
 *    - In 'outline' mode: base is dark/current on light canvas; moving pill is black with white text.
 *    - In 'solid' mode: base is white on ink-black; moving pill is white with black text.
 *    - In 'inverted' mode: base is light/current on dark canvas; moving pill is white with black text.
 * 2. HackyText Cyber-Decryption on Hover & Click:
 *    - On hover/click, the text scrambles through Katakana/Hex/Matrix glyphs and resolves left-to-right.
 * 3. Invariant Layout Geometry:
 *    - Hidden spacer guarantees 0px layout shifts during character scrambling.
 */
export const LinkHover = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, LinkHoverProps>(
  (
    {
      children,
      text,
      shortText,
      shortBreakpoint = 'desktop',
      href,
      target,
      rel,
      onClick,
      onKeyDown,
      role,
      'aria-checked': ariaChecked,
      tabIndex,
      className = '',
      bgFillColor,
      buttonRef,
      scrambleOnHover = true,
      scrambleOnClick = false,
      variant = 'outline',
      isHovered,
      isActive,
      onHoverChange,
      'aria-label': ariaLabel,
      dataNavTab,
      'data-nav-tab': dataNavTabAttr,
    },
    forwardedRef
  ) => {
    const rootRef = useRef<HTMLElement | null>(null)
    const bgRef = useRef<HTMLDivElement>(null)
    const innerRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number | null>(null)
    const timelineRef = useRef<gsap.core.Timeline | null>(null)
    const wasHoveredRef = useRef<boolean>(false)
    const isControlled = isHovered !== undefined

    const isSolid = variant === 'solid'
    const isInverted = variant === 'inverted'
    const actualBgFillColor = bgFillColor || (isInverted ? '#ffffff' : (isSolid ? '#ffffff' : '#000000'))

    // Determine target plain text for scrambling
    const originalText = text || (typeof children === 'string' ? children : '')
    const originalShortText = shortText || ''
    const effectiveBreakpoint = shortBreakpoint || 'desktop'

    const [displayText, setDisplayText] = useState<string>(originalText)
    const [displayShortText, setDisplayShortText] = useState<string>(originalShortText)

    // Synchronize if children, text or shortText changes
    useEffect(() => {
      if (text) {
        setDisplayText(text)
      } else if (typeof children === 'string') {
        setDisplayText(children)
      }

      if (shortText) {
        setDisplayShortText(shortText)
      }
    }, [children, text, shortText])

    // Clean up timers & tweens on unmount
    useEffect(() => {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (timelineRef.current) timelineRef.current.kill()
      }
    }, [])

    const setRef = (node: any) => {
      rootRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef && 'current' in forwardedRef) (forwardedRef as any).current = node
      if (typeof buttonRef === 'function') buttonRef(node)
      else if (buttonRef && 'current' in buttonRef) (buttonRef as any).current = node
    }

    const startScramble = useCallback(() => {
      if ((!scrambleOnHover && !scrambleOnClick) || (!originalText && !originalShortText)) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      const totalChars = originalText.length
      const totalShortChars = originalShortText.length
      const maxChars = Math.max(totalChars, totalShortChars)
      const duration = Math.min(290, Math.max(210, (0.01 * maxChars + 0.19) * 1000))
      const startTime = performance.now()

      if (totalChars > 0) {
        let initialScramble = ''
        for (let i = 0; i < totalChars; i++) {
          if (originalText[i] === ' ') {
            initialScramble += ' '
          } else {
            const randIdx = Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)
            initialScramble += SCRAMBLE_GLYPHS[randIdx]
          }
        }
        setDisplayText(initialScramble)
      }

      if (totalShortChars > 0) {
        let initialShortScramble = ''
        for (let i = 0; i < totalShortChars; i++) {
          if (originalShortText[i] === ' ') {
            initialShortScramble += ' '
          } else {
            const randIdx = Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)
            initialShortScramble += SCRAMBLE_GLYPHS[randIdx]
          }
        }
        setDisplayShortText(initialShortScramble)
      }

      const step = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(1, elapsed / duration)

        if (totalChars > 0) {
          const at = Math.floor(progress * totalChars)
          let result = ''
          for (let i = 0; i < totalChars; i++) {
            if (i < at) {
              result += originalText[i]
            } else if (originalText[i] === ' ') {
              result += ' '
            } else {
              const randIdx = Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)
              result += SCRAMBLE_GLYPHS[randIdx]
            }
          }
          setDisplayText(result)
        }

        if (totalShortChars > 0) {
          const atShort = Math.floor(progress * totalShortChars)
          let shortResult = ''
          for (let i = 0; i < totalShortChars; i++) {
            if (i < atShort) {
              shortResult += originalShortText[i]
            } else if (originalShortText[i] === ' ') {
              shortResult += ' '
            } else {
              const randIdx = Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)
              shortResult += SCRAMBLE_GLYPHS[randIdx]
            }
          }
          setDisplayShortText(shortResult)
        }

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          if (totalChars > 0) setDisplayText(originalText)
          if (totalShortChars > 0) setDisplayShortText(originalShortText)
          rafRef.current = null
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }, [originalText, originalShortText, scrambleOnHover, scrambleOnClick])

    // Cyber-matrix decrypt scramble when button transitions to active state (e.g. game preset activated)
    const prevActiveRef = useRef<boolean>(isActive ?? false)
    useEffect(() => {
      if (isActive !== undefined) {
        if (isActive && !prevActiveRef.current) {
          startScramble()
        }
        prevActiveRef.current = isActive
      }
    }, [isActive, startScramble])

    // Cyber-matrix decrypt scramble when label text changes dynamically after mount (e.g. BEZELS toggled)
    const isFirstMountRef = useRef<boolean>(true)
    useEffect(() => {
      if (isFirstMountRef.current) {
        isFirstMountRef.current = false
        return
      }
      if (scrambleOnClick || scrambleOnHover) {
        startScramble()
      }
    }, [text, shortText, scrambleOnClick, scrambleOnHover, startScramble])

    const playEnterAnimation = useCallback(() => {
      wasHoveredRef.current = true
      if (!bgRef.current || !innerRef.current) return

      if (timelineRef.current) {
        timelineRef.current.kill()
        timelineRef.current = null
      }
      gsap.killTweensOf([bgRef.current, innerRef.current])

      const tl = gsap.timeline()
      timelineRef.current = tl

      tl.fromTo(
        bgRef.current,
        { x: '-101%' },
        { x: '0%', duration: 0.44, ease: 'power2.out' }
      )
      tl.fromTo(
        innerRef.current,
        { x: '101%' },
        { x: '0%', duration: 0.44, ease: 'power2.out' },
        0
      )
      startScramble()
    }, [startScramble])

    const playLeaveAnimation = useCallback((fast = false) => {
      if (!wasHoveredRef.current) return
      wasHoveredRef.current = false
      if (!bgRef.current || !innerRef.current) return

      if (timelineRef.current) {
        timelineRef.current.kill()
        timelineRef.current = null
      }
      gsap.killTweensOf([bgRef.current, innerRef.current])

      const duration = fast ? 0.26 : 0.38

      const tl = gsap.timeline({
        onComplete: () => {
          if (bgRef.current) gsap.set(bgRef.current, { x: '-101%' })
          if (innerRef.current) gsap.set(innerRef.current, { x: '101%' })
          timelineRef.current = null
        },
      })
      timelineRef.current = tl

      tl.to(bgRef.current, {
        x: '101%',
        duration,
        ease: 'power2.out',
      })
      tl.to(
        innerRef.current,
        {
          x: '-101%',
          duration,
          ease: 'power2.out',
        },
        0
      )
    }, [])

    const resetToIdle = useCallback(() => {
      wasHoveredRef.current = false
      if (timelineRef.current) {
        timelineRef.current.kill()
        timelineRef.current = null
      }
      if (bgRef.current) {
        gsap.killTweensOf(bgRef.current)
        gsap.set(bgRef.current, { x: '-101%' })
      }
      if (innerRef.current) {
        gsap.killTweensOf(innerRef.current)
        gsap.set(innerRef.current, { x: '101%' })
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (originalText) setDisplayText(originalText)
      if (originalShortText) setDisplayShortText(originalShortText)
    }, [originalText, originalShortText])

    // Controlled hover state synchronization (used for multi-header seamless wipes)
    useEffect(() => {
      if (!isControlled) return

      if (isHovered && !wasHoveredRef.current) {
        if (rootRef.current?.getAttribute('data-suppress-hover') === 'true') {
          return
        }
        playEnterAnimation()
      } else if (!isHovered && wasHoveredRef.current) {
        if (rootRef.current?.getAttribute('data-suppress-hover') === 'true') {
          resetToIdle()
          return
        }
        playLeaveAnimation()
      }
    }, [isHovered, isControlled, playEnterAnimation, playLeaveAnimation, resetToIdle])

    // Instant reset listener for cart button to return to idle without exit animation
    useEffect(() => {
      const handleCartReset = () => {
        if (
          rootRef.current?.matches('a[href*="steampowered.com"]') ||
          rootRef.current?.getAttribute('data-suppress-hover') === 'true'
        ) {
          resetToIdle()
        }
      }
      window.addEventListener('steamdeck-cart-reset-idle', handleCartReset)
      return () => {
        window.removeEventListener('steamdeck-cart-reset-idle', handleCartReset)
      }
    }, [resetToIdle])

    // Clean up hover state on tab blur, return to tab, or when hover is suppressed
    useEffect(() => {
      const handleVisibilityOrFocusOrBlur = () => {
        if (
          showcaseState.isTransitioning ||
          showcaseState.portalPhase !== 'idle' ||
          (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
          showcaseState.scene5Phase !== 'idle'
        ) {
          return
        }
        if (typeof document !== 'undefined' && rootRef.current) {
          try {
            if (rootRef.current.getAttribute('data-suppress-hover') === 'true') {
              if (onHoverChange) {
                onHoverChange(false)
              }
              resetToIdle()
              return
            }
            const effectiveNavTab = dataNavTab !== undefined ? dataNavTab : (typeof dataNavTabAttr === 'number' ? dataNavTabAttr : (dataNavTabAttr ? parseInt(dataNavTabAttr as string, 10) : undefined))
            if (effectiveNavTab !== undefined) {
              const mousePos = showcaseState.lastMousePos
              if (mousePos && isMouseOverNavTab(effectiveNavTab, mousePos, true)) {
                return
              }
            }
            if (isControlled && isHovered) {
              return
            }
            if (!rootRef.current.matches(':hover')) {
              if (onHoverChange) {
                onHoverChange(false)
              }
              resetToIdle()
            }
          } catch (_) { }
        }
      }

      window.addEventListener('focus', handleVisibilityOrFocusOrBlur)
      window.addEventListener('blur', handleVisibilityOrFocusOrBlur)
      document.addEventListener('visibilitychange', handleVisibilityOrFocusOrBlur)
      window.addEventListener('pagehide', handleVisibilityOrFocusOrBlur)
      return () => {
        window.removeEventListener('focus', handleVisibilityOrFocusOrBlur)
        window.removeEventListener('blur', handleVisibilityOrFocusOrBlur)
        document.removeEventListener('visibilitychange', handleVisibilityOrFocusOrBlur)
        window.removeEventListener('pagehide', handleVisibilityOrFocusOrBlur)
      }
    }, [dataNavTab, dataNavTabAttr, onHoverChange, resetToIdle])

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      const isTouchDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 880 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
      )
      if (isTouchDevice) {
        return
      }

      if (e.clientX || e.clientY) {
        showcaseState.lastMousePos = { x: e.clientX, y: e.clientY }
      }
      if (rootRef.current?.getAttribute('data-suppress-hover') === 'true') {
        return
      }

      const isAnyTransition = (
        showcaseState.isTransitioning ||
        showcaseState.portalPhase !== 'idle' ||
        (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
        showcaseState.scene5Phase !== 'idle' ||
        showcaseState.scene4Phase !== 'idle'
      )

      const isAlreadyHovered = (isControlled && Boolean(isHovered)) || wasHoveredRef.current

      // Play hover audio only if this tab was not already hovered and no scene transition is wiping across
      if (!isAlreadyHovered && !isAnyTransition) {
        soundManager.playHover()
      }

      if (onHoverChange) {
        onHoverChange(true)
      }
      if (isControlled) return
      if (wasHoveredRef.current) return
      playEnterAnimation()
    }

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      const target = e.relatedTarget
      if (rootRef.current && target) {
        if (rootRef.current === target) return
        if (typeof Node !== 'undefined' && target instanceof Node && rootRef.current.contains(target)) {
          return
        }
      }

      const isTouchDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 880 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
      )

      if (isTouchDevice) {
        rootRef.current?.removeAttribute('data-suppress-hover')
        if (onHoverChange) {
          onHoverChange(false)
        }
        if (isControlled) return
        playLeaveAnimation()
        return
      }

      const mouseX = e.clientX || showcaseState.lastMousePos?.x || 0
      const mouseY = e.clientY || showcaseState.lastMousePos?.y || 0

      const isAnyTransition = (
        showcaseState.isTransitioning ||
        showcaseState.portalPhase !== 'idle' ||
        (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
        showcaseState.scene5Phase !== 'idle'
      )

      // If pointer is physically inside rootRef during transition/portal/shutter, ignore synthetic leave event
      if (rootRef.current && isAnyTransition) {
        const rect = rootRef.current.getBoundingClientRect()
        const isStillInside = (
          mouseX >= rect.left - 2 && mouseX <= rect.right + 2 &&
          (
            (mouseY >= rect.top - 2 && mouseY <= rect.bottom + 2) ||
            (mouseY >= 0 && mouseY <= 70)
          )
        )
        if (isStillInside) {
          return
        }
      }

      const effectiveNavTab = dataNavTab !== undefined ? dataNavTab : (typeof dataNavTabAttr === 'number' ? dataNavTabAttr : (dataNavTabAttr ? parseInt(dataNavTabAttr as string, 10) : undefined))
      if (effectiveNavTab !== undefined && typeof window !== 'undefined') {
        const mousePos = { x: mouseX, y: mouseY }
        // If mouse is still physically over this tab on any header bar, ignore synthetic leave from deactivated layer
        if (isMouseOverNavTab(effectiveNavTab, mousePos, true)) {
          return
        }
      }

      // Release hover suppression lock once the cursor has physically left the button
      rootRef.current?.removeAttribute('data-suppress-hover')

      if (onHoverChange) {
        onHoverChange(false)
      }
      if (isControlled) return
      playLeaveAnimation()
    }

    const handleFocus = () => {
      if (rootRef.current?.getAttribute('data-suppress-hover') === 'true') {
        return
      }
      const isTouchDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 880 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
      )
      if (isTouchDevice) {
        return
      }
      // Only enter hover animation on keyboard navigation (:focus-visible) or actual mouse hover (:hover).
      // Avoid spuriously re-triggering the hover train when the browser restores document focus on tab return.
      if (typeof document !== 'undefined' && rootRef.current) {
        try {
          if (!rootRef.current.matches(':focus-visible') && !rootRef.current.matches(':hover')) {
            return
          }
        } catch (_) { }
      }
      if (onHoverChange) {
        onHoverChange(true)
      }
      if (isControlled) return
      if (wasHoveredRef.current) return
      playEnterAnimation()
    }

    const handleBlur = () => {
      if (typeof document !== 'undefined' && rootRef.current) {
        try {
          if (rootRef.current.matches(':hover')) return
        } catch (_) { }
      }
      const isAnyTransition = (
        showcaseState.isTransitioning ||
        showcaseState.portalPhase !== 'idle' ||
        (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
        showcaseState.scene5Phase !== 'idle'
      )
      if (isAnyTransition) {
        return
      }
      const effectiveNavTab = dataNavTab !== undefined ? dataNavTab : (typeof dataNavTabAttr === 'number' ? dataNavTabAttr : (dataNavTabAttr ? parseInt(dataNavTabAttr as string, 10) : undefined))
      if (effectiveNavTab !== undefined && typeof window !== 'undefined') {
        const mousePos = showcaseState.lastMousePos
        if (mousePos && isMouseOverNavTab(effectiveNavTab, mousePos, true)) {
          return
        }
      }
      if (onHoverChange) {
        onHoverChange(false)
      }
      if (isControlled) return
      playLeaveAnimation()
    }

    const renderContent = (isMovingLayer: boolean) => {
      const textColorClass = isMovingLayer
        ? (isInverted ? 'text-black' : (isSolid ? 'text-black' : 'text-white'))
        : (isSolid ? 'text-white' : 'text-current')

      if (originalShortText) {
        const fullClass = effectiveBreakpoint === 'sm'
          ? 'hidden sm:inline'
          : effectiveBreakpoint === 'md'
            ? 'hidden md:inline'
            : 'hidden min-[881px]:inline'

        const shortClass = effectiveBreakpoint === 'sm'
          ? 'sm:hidden'
          : effectiveBreakpoint === 'md'
            ? 'md:hidden'
            : 'min-[881px]:hidden'

        return (
          <span className={`relative inline-block whitespace-nowrap transition-colors duration-[140ms] group-hover:duration-[100ms] ease-out ${textColorClass}`}>
            <span className="invisible select-none opacity-0">
              <span className={`${fullClass} whitespace-nowrap`}>{originalText}</span>
              <span className={`${shortClass} whitespace-nowrap`}>{originalShortText}</span>
            </span>
            <span className="absolute inset-0 flex items-center justify-center">
              <span className={`${fullClass} whitespace-nowrap`}>{displayText}</span>
              <span className={`${shortClass} whitespace-nowrap`}>{displayShortText}</span>
            </span>
          </span>
        )
      }

      if (originalText) {
        return (
          <span className={`relative inline-block whitespace-nowrap transition-colors duration-[140ms] group-hover:duration-[100ms] ease-out ${textColorClass}`}>
            {/* Invisible spacer guarantees 100% constant layout width */}
            <span className="invisible select-none opacity-0">{originalText}</span>
            <span className="absolute inset-0 flex items-center justify-center">
              {displayText}
            </span>
          </span>
        )
      }

      return (
        <span className={`transition-colors duration-[140ms] group-hover:duration-[100ms] ease-out ${textColorClass}`}>
          {children}
        </span>
      )
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      const isTouchDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 880 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
      )

      if (!isTouchDevice && (e.clientX || e.clientY)) {
        showcaseState.lastMousePos = { x: e.clientX, y: e.clientY }
      }
      soundManager.playButtonClick()
      if (scrambleOnClick) {
        startScramble()
      }
      if (onClick) onClick()
    }

    const focusRingStyle = isInverted || isSolid
      ? 'outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/90 focus-visible:ring-offset-1 focus-visible:ring-offset-black'
      : 'outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:ring-offset-1 focus-visible:ring-offset-white'

    const commonProps = {
      className: `kpr-link-hover hud-link-hover group relative inline-flex items-center justify-center cursor-pointer select-none overflow-hidden transition-colors duration-[140ms] hover:duration-[100ms] ease-out ${focusRingStyle} ${className}`,
      'data-nav-tab': dataNavTab !== undefined ? dataNavTab : dataNavTabAttr,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onClick: handleClick,
      onKeyDown,
      role,
      tabIndex,
      'aria-checked': ariaChecked,
      'aria-label': ariaLabel || originalText || undefined,
    }

    const innerBody = (
      <>
        {/* Layer 1: Base text sits on button canvas with smooth font illumination and fade-out */}
        <span aria-hidden="true" className="relative z-[1] w-full h-full inline-flex items-center justify-center pointer-events-none transition-colors duration-[140ms] group-hover:duration-[100ms] ease-out">
          {renderContent(false)}
        </span>

        {/* Layer 2: Moving pill (-101% -> 0% -> 101%) with counter-translated inverted text */}
        <div
          aria-hidden="true"
          ref={bgRef}
          className="absolute inset-0 z-[2] overflow-hidden pointer-events-none -translate-x-[101%]"
          style={{ backgroundColor: actualBgFillColor }}
        >
          <div
            ref={innerRef}
            className={`absolute inset-0 w-full h-full flex items-center justify-center translate-x-[101%] ${isSolid || isInverted ? 'text-black' : 'text-white'}`}
          >
            {renderContent(true)}
          </div>
        </div>
      </>
    )

    if (href) {
      return (
        <a ref={setRef} href={href} target={target} rel={rel} {...commonProps}>
          {innerBody}
        </a>
      )
    }

    return (
      <button ref={setRef} type="button" {...commonProps}>
        {innerBody}
      </button>
    )
  }
)

LinkHover.displayName = 'LinkHover'
