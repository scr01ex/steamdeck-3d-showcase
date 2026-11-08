'use client'

import React, { useEffect, useRef } from 'react'
import { showcaseState } from '../3d/deckState'
import { isMouseOverNavTab } from './navigationUtils'

export interface UseOverlayHeaderHoverProps {
  hoveredNav: number | null
  setHoveredNav: React.Dispatch<React.SetStateAction<number | null>>
  isCartHovered: boolean
  setIsCartHovered: (v: boolean) => void
  isSoundHovered: boolean
  setIsSoundHovered: (v: boolean) => void
  lastMousePosRef: React.MutableRefObject<{ x: number; y: number } | null>
  cartClickedRef: React.MutableRefObject<boolean>
  suppressCartHoverRef: React.MutableRefObject<boolean>
  portalPhase: string
  shutterPhase: string
  scene5Phase: string
  activeScene: number
}

export function useOverlayHeaderHover({
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
}: UseOverlayHeaderHoverProps) {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const isMobile = typeof window !== 'undefined' && (
        window.innerWidth <= 880 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
      )
      if (isMobile) return

      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      showcaseState.lastMousePos = { x: e.clientX, y: e.clientY }

      if (hoveredNav !== null) {
        if (isMouseOverNavTab(hoveredNav, { x: e.clientX, y: e.clientY }, true)) {
          return
        }
        const navButtons = document.querySelectorAll<HTMLElement>('nav .kpr-link-hover, nav .hud-link-hover, .hud-mobile-dock .hud-link-hover')
        let isOverAnyNav = false
        navButtons.forEach((btn) => {
          const rect = btn.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isOverAnyNav = true
          }
        })
        if (!isOverAnyNav) {
          setHoveredNav(null)
        }
      }

      if (suppressCartHoverRef.current) {
        const cartBtns = document.querySelectorAll<HTMLElement>('header a[href*="steampowered.com"]')
        let isInsideAnyCart = false
        cartBtns.forEach((btn) => {
          const rect = btn.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isInsideAnyCart = true
          }
        })
        if (!isInsideAnyCart) {
          suppressCartHoverRef.current = false
          cartClickedRef.current = false
          cartBtns.forEach((btn) => {
            btn.removeAttribute('data-suppress-hover')
          })
          setIsCartHovered(false)
        }
      } else if (isCartHovered) {
        const cartBtns = document.querySelectorAll<HTMLElement>('header a[href*="steampowered.com"]')
        let isOverAnyCart = false
        cartBtns.forEach((btn) => {
          const rect = btn.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isOverAnyCart = true
          }
        })
        if (!isOverAnyCart) {
          setIsCartHovered(false)
        }
      }

      if (isSoundHovered) {
        const soundBtns = document.querySelectorAll<HTMLElement>('header [data-sound-toggle="true"]')
        let isOverAnySound = false
        soundBtns.forEach((btn) => {
          const rect = btn.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isOverAnySound = true
          }
        })
        if (!isOverAnySound) {
          setIsSoundHovered(false)
        }
      }
    }

    const handleMouseLeaveWindow = () => {
      setHoveredNav(null)
      setIsSoundHovered(false)
      if (suppressCartHoverRef.current || cartClickedRef.current) {
        setIsCartHovered(false)
        window.dispatchEvent(new CustomEvent('steamdeck-cart-reset-idle'))
      } else {
        setIsCartHovered(false)
      }
    }

    const handleWindowBlur = () => {
      setHoveredNav(null)
      setIsSoundHovered(false)
      if (suppressCartHoverRef.current || cartClickedRef.current) {
        setIsCartHovered(false)
        window.dispatchEvent(new CustomEvent('steamdeck-cart-reset-idle'))
      } else {
        setIsCartHovered(false)
      }
    }

    const handleWindowFocus = () => {
      if (suppressCartHoverRef.current) {
        // Returned from Steam tab: button must already be unpressed with 0 animation
        setIsCartHovered(false)
        window.dispatchEvent(new CustomEvent('steamdeck-cart-reset-idle'))
        const cartBtns = document.querySelectorAll<HTMLElement>('header a[href*="steampowered.com"]')
        cartBtns.forEach((btn) => {
          btn.setAttribute('data-suppress-hover', 'true')
          btn.blur()
        })
      } else {
        const isOverCart = Array.from(document.querySelectorAll<HTMLElement>('header a[href*="steampowered.com"]')).some((btn) => {
          try { return btn.matches(':hover') } catch (_) { return false }
        })
        if (!isOverCart) {
          setIsCartHovered(false)
        }
      }

      const isOverSound = Array.from(document.querySelectorAll<HTMLElement>('header [data-sound-toggle="true"]')).some((btn) => {
        try { return btn.matches(':hover') } catch (_) { return false }
      })
      if (!isOverSound) {
        setIsSoundHovered(false)
      }

      const isOverNav = Array.from(document.querySelectorAll<HTMLElement>('nav .kpr-link-hover, nav .hud-link-hover')).some((btn) => {
        try { return btn.matches(':hover') } catch (_) { return false }
      })
      if (!isOverNav) {
        setHoveredNav(null)
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleWindowBlur()
      } else {
        handleWindowFocus()
      }
    }

    const handlePageHide = () => {
      handleWindowBlur()
    }

    const handleMouseDown = (e: MouseEvent) => {
      const isMobile = typeof window !== 'undefined' && (
        window.innerWidth <= 880 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches
      )
      if (isMobile) return

      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      showcaseState.lastMousePos = { x: e.clientX, y: e.clientY }
    }

    const handleTouchStart = () => {
      lastMousePosRef.current = null
      showcaseState.lastMousePos = null
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mousedown', handleMouseDown, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('mouseleave', handleMouseLeaveWindow)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('mouseleave', handleMouseLeaveWindow)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [hoveredNav, isCartHovered, isSoundHovered])

  // When any transition finishes, verify if mouse is still hovering the nav bar or cart button
  const prevPortalPhaseRef = useRef<string>(portalPhase)
  const prevShutterPhaseRef = useRef<string>(shutterPhase)
  const prevScene5PhaseRef = useRef<string>(scene5Phase)
  const prevActiveSceneRef = useRef<number>(activeScene)

  useEffect(() => {
    const wasPortalTrans = prevPortalPhaseRef.current !== 'idle'
    prevPortalPhaseRef.current = portalPhase

    const wasShutterTrans = prevShutterPhaseRef.current === 'closing' || prevShutterPhaseRef.current === 'closed' || prevShutterPhaseRef.current === 'opening'
    prevShutterPhaseRef.current = shutterPhase

    const wasScene5Trans = prevScene5PhaseRef.current === 'transitioning'
    prevScene5PhaseRef.current = scene5Phase

    const sceneChanged = prevActiveSceneRef.current !== activeScene
    prevActiveSceneRef.current = activeScene

    const isAnyTransition = 
      showcaseState.isTransitioning || 
      portalPhase !== 'idle' || 
      (shutterPhase !== 'idle' && shutterPhase !== 'darkroom') || 
      scene5Phase !== 'idle'

    const justFinished = !isAnyTransition && (
      (wasPortalTrans && portalPhase === 'idle') || 
      (wasShutterTrans && (shutterPhase === 'idle' || shutterPhase === 'darkroom')) ||
      (wasScene5Trans && scene5Phase === 'idle') ||
      (sceneChanged && !wasPortalTrans && !wasShutterTrans && !wasScene5Trans)
    )

    if (justFinished) {
      const checkHover = () => {
        const isMobile = typeof window !== 'undefined' && (
          window.innerWidth <= 880 ||
          ('ontouchstart' in window) ||
          (navigator.maxTouchPoints > 0) ||
          window.matchMedia('(hover: none), (pointer: coarse)').matches
        )
        if (isMobile) {
          setHoveredNav(null)
          setIsCartHovered(false)
          setIsSoundHovered(false)
          return
        }

        if (
          showcaseState.isTransitioning ||
          showcaseState.portalPhase !== 'idle' ||
          (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
          showcaseState.scene5Phase !== 'idle'
        ) {
          return
        }
        const mousePos = lastMousePosRef.current || showcaseState.lastMousePos
        if (!mousePos) {
          setHoveredNav(null)
          setIsCartHovered(false)
          return
        }
        const { x, y } = mousePos

        let activeTabHovered: number | null = null
        for (const tid of [1, 2, 3, 5]) {
          if (isMouseOverNavTab(tid, { x, y }, true)) {
            activeTabHovered = tid
            break
          }
        }

        if (activeTabHovered !== null) {
          setHoveredNav(activeTabHovered)
        } else if (hoveredNav !== null) {
          setHoveredNav(null)
        }

        if (isCartHovered) {
          const cartBtns = document.querySelectorAll<HTMLElement>('header a[href*="steampowered.com"]')
          let stillHoveredCart = false
          cartBtns.forEach((btn) => {
            const rect = btn.getBoundingClientRect()
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
              stillHoveredCart = true
            }
          })
          if (!stillHoveredCart) {
            setIsCartHovered(false)
          }
        }

        if (isSoundHovered) {
          const soundBtns = document.querySelectorAll<HTMLElement>('header [data-sound-toggle="true"]')
          let stillHoveredSound = false
          soundBtns.forEach((btn) => {
            const rect = btn.getBoundingClientRect()
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
              stillHoveredSound = true
            }
          })
          if (!stillHoveredSound) {
            setIsSoundHovered(false)
          }
        }
      }

      checkHover()
      const t1 = setTimeout(checkHover, 40)
      const t2 = setTimeout(checkHover, 120)
      const t3 = setTimeout(checkHover, 260)
      const t4 = setTimeout(checkHover, 480)

      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
        clearTimeout(t4)
      }
    }
  }, [portalPhase, shutterPhase, scene5Phase, activeScene, hoveredNav, isCartHovered, isSoundHovered, setIsCartHovered, setIsSoundHovered, setHoveredNav])
}
