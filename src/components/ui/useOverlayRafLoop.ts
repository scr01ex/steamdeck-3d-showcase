'use client'

import React, { useEffect } from 'react'
import { showcaseState, getScrollElement } from '../3d/deckState'
import { soundManager } from '../../audio/soundEngine'
import { trackEvent } from '@/lib/analytics'
import { convertViewportPolygonToLocal } from './overlayGeometry'

export interface UseOverlayRafLoopProps {
  mounted: boolean
  lastTimeRef: React.MutableRefObject<number>
  lastOffsetRef: React.MutableRefObject<number>
  arrowLeftHeldRef: React.MutableRefObject<boolean>
  arrowRightHeldRef: React.MutableRefObject<boolean>
  arrowDownHeldRef: React.MutableRefObject<boolean>
  arrowUpHeldRef: React.MutableRefObject<boolean>
  headerRef: React.RefObject<HTMLElement | null>
  darkroomHeaderRef: React.RefObject<HTMLElement | null>
  portalDarkHeaderRef: React.RefObject<HTMLElement | null>
  portalWhiteHeaderRef: React.RefObject<HTMLElement | null>
  lastWhiteActiveRef: React.MutableRefObject<boolean | null>
  lastDarkActiveRef: React.MutableRefObject<boolean | null>
  bootPromptRef: React.RefObject<HTMLDivElement | null>
  mobileDockRef: React.RefObject<HTMLElement | null>
  lastDockVisibleRef: React.MutableRefObject<boolean | null>
  lightDockRef: React.RefObject<HTMLDivElement | null>
  darkDockRef: React.RefObject<HTMLDivElement | null>
  portalDarkDockRef: React.RefObject<HTMLDivElement | null>
  portalLightDockRef: React.RefObject<HTMLDivElement | null>
  card1Ref: React.RefObject<HTMLDivElement | null>
  card1ParaRef: React.RefObject<HTMLParagraphElement | null>
  card1ParaProgRef: React.MutableRefObject<number>
  card1ExitStartTimeRef: React.MutableRefObject<number | null>
  card1WasVisibleAtPortalStartRef: React.MutableRefObject<boolean>
  card1InitialOpacityRef: React.MutableRefObject<number>
  card1ParaInitialProgRef: React.MutableRefObject<number>
  hasBootChimedRef: React.MutableRefObject<boolean>
  isCard1TextCompleteRef: React.MutableRefObject<boolean>
  cardActiveRef: React.MutableRefObject<{ card1: boolean }>
  setCardActive: React.Dispatch<React.SetStateAction<{ card1: boolean }>>
  isDarkroomVisibleRef: React.MutableRefObject<boolean>
  setIsDarkroomVisible: React.Dispatch<React.SetStateAction<boolean>>
  pendingScene2TransitionRef: React.MutableRefObject<boolean>
  pendingScene2TimerRef: React.MutableRefObject<NodeJS.Timeout | null>
  requestScene2TransitionFromMobile: () => void
}

export function useOverlayRafLoop({
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
}: UseOverlayRafLoopProps) {
  useEffect(() => {
    if (!mounted) return

    let animId: number
    const onFrame = () => {
      const p = (showcaseState.isReady && typeof showcaseState.offset === 'number' && !isNaN(showcaseState.offset)) ? showcaseState.offset : 0

      // Calculate dynamic scroll velocity and decoding acceleration multiplier
      const now = performance.now()
      const dt = lastTimeRef.current > 0 ? Math.min(100, Math.max(1, now - lastTimeRef.current)) : 16
      if (lastTimeRef.current > 0) {
        const dp = Math.abs(p - lastOffsetRef.current)
        const rawVel = (dp / dt) * 1000

        if (rawVel > showcaseState.velocity) {
          showcaseState.velocity = showcaseState.velocity * 0.25 + rawVel * 0.75
        } else {
          showcaseState.velocity = showcaseState.velocity * 0.88 + rawVel * 0.12
        }

        const vel = showcaseState.velocity
        if (vel <= 0.06) {
          showcaseState.speedFactor = 1.0
        } else {
          showcaseState.speedFactor = Math.min(8.0, 1.0 + (vel - 0.06) * 5.0)
        }
      }
      lastOffsetRef.current = p
      lastTimeRef.current = now

      if (arrowLeftHeldRef.current || arrowRightHeldRef.current) {
        if (showcaseState.activeScene === 2 && !showcaseState.isTransitioning) {
          const splitSpeed = 0.55 * (dt / 1000)
          if (arrowLeftHeldRef.current) {
            showcaseState.setSplitPos(Math.max(0, showcaseState.splitPos - splitSpeed))
          }
          if (arrowRightHeldRef.current) {
            showcaseState.setSplitPos(Math.min(1, showcaseState.splitPos + splitSpeed))
          }
        } else if ((showcaseState.activeScene === 3 || showcaseState.activeScene === 4) && !showcaseState.isTransitioning) {
          const impulse = 1.6 * (dt / 1000)
          if (arrowLeftHeldRef.current) {
            showcaseState.addRingRotationImpulse(-impulse)
          }
          if (arrowRightHeldRef.current) {
            showcaseState.addRingRotationImpulse(impulse)
          }
        }
      }

      if (arrowDownHeldRef.current || arrowUpHeldRef.current) {
        if (showcaseState.activeScene === 1 && !showcaseState.isTransitioning) {
          const el = getScrollElement()
          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight
            if (maxScroll > 0) {
              const scrollSpeed = Math.max(750, maxScroll * 0.18) * (dt / 1000)
              if (arrowDownHeldRef.current) {
                if (el.scrollTop >= maxScroll * 0.44) {
                  arrowDownHeldRef.current = false
                  el.scrollTop = maxScroll * 0.45
                  showcaseState.triggerTransition(2)
                } else {
                  const nextTop = el.scrollTop + scrollSpeed
                  if (nextTop >= maxScroll * 0.44) {
                    arrowDownHeldRef.current = false
                    el.scrollTop = maxScroll * 0.45
                    showcaseState.triggerTransition(2)
                  } else {
                    el.scrollTop = nextTop
                  }
                }
              }
              if (arrowUpHeldRef.current) {
                el.scrollTop = Math.max(0, el.scrollTop - scrollSpeed)
              }
            }
          }
        }
      }

      const isScene1 = showcaseState.activeScene === 1
      const isPortal = showcaseState.portalPhase !== 'idle'
      const portalProg = showcaseState.portalProgress
      const isShutterClosingOrClosed = showcaseState.shutterPhase === 'closing' || showcaseState.shutterPhase === 'closed'
      const isScene1Portal = isPortal && (showcaseState.portalSourceScene === 1 || showcaseState.portalTargetScene === 1)

      const isDirectScene1To5 = isPortal && (
        (showcaseState.portalSourceScene === 1 && showcaseState.portalTargetScene === 5) ||
        (showcaseState.portalSourceScene === 5 && showcaseState.portalTargetScene === 1)
      )

      const isDirectScene2To5 = isPortal && (
        (showcaseState.portalSourceScene === 2 && showcaseState.portalTargetScene === 5) ||
        (showcaseState.portalSourceScene === 5 && showcaseState.portalTargetScene === 2)
      )

      // Aperture portal between Scene 2 (Darkroom) and Scene 3 (White Studio Library):
      const isScene2To3Portal = isPortal && !isDirectScene2To5 && (
        (showcaseState.portalSourceScene === 2 && (showcaseState.portalTargetScene === 3 || showcaseState.portalTargetScene === 4)) ||
        ((showcaseState.portalSourceScene === 3 || showcaseState.portalSourceScene === 4) && showcaseState.portalTargetScene === 2)
      )

      // Aperture portal between Scene 1 (Overview) and Scene 3 (White Studio Library):
      const isScene1To3Portal = isPortal && !isDirectScene1To5 && (
        (showcaseState.portalSourceScene === 1 && (showcaseState.portalTargetScene === 3 || showcaseState.portalTargetScene === 4)) ||
        ((showcaseState.portalSourceScene === 3 || showcaseState.portalSourceScene === 4) && showcaseState.portalTargetScene === 1)
      )

      const isPortalEntering2 = isPortal && (
        showcaseState.portalTargetScene === 2 ||
        showcaseState.intendedTargetScene === 2 ||
        showcaseState.navTargetScene === 2
      )
      const isPortalExiting2 = isPortal && (
        showcaseState.portalSourceScene === 2
      )

      const darkroomActive = !isScene1 && (
        // Idle residency in Scene 2 (when portal is not active)
        (!isPortal && showcaseState.activeScene === 2) ||
        // Return to Scene 2 via portal: UI is stable and prepared under closing aperture
        isPortalEntering2 ||
        // Exit from Scene 2 via portal: controls stay visible until aperture expands full-screen
        (isPortalExiting2 && portalProg < 0.98)
      )

      const s5Prog = showcaseState.scene5Progress
      const isScene5TransitionActive = (
        showcaseState.scene5Phase === 'transitioning' ||
        (showcaseState.isTransitioning && (showcaseState.navTargetScene === 5 || showcaseState.intendedTargetScene === 5))
      )
      const isScene5Active = (showcaseState.activeScene === 5 || s5Prog > 0.001 || isScene5TransitionActive) && !isDirectScene1To5 && !isDirectScene2To5

      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 880

      // Top light header: visible in Scene 1, 3, and 4 (Library). Transitions smoothly to dark header in Scene 5:
      const scene1HeaderActive = isScene1 && p >= 0.14
      const isHeaderVisible = (
        scene1HeaderActive ||
        ((showcaseState.activeScene === 3 || showcaseState.activeScene === 4) && !isPortal && s5Prog < 0.98) ||
        (isPortal && (isScene1To3Portal || isScene2To3Portal || isDirectScene1To5))
      )
      if (headerRef.current) {
        let whiteOp = 0
        if (isDirectScene1To5) {
          whiteOp = 1
        } else if (isDirectScene2To5) {
          whiteOp = 0
        } else if (isScene5Active) {
          whiteOp = Math.max(0, 1.0 - s5Prog)
        } else if (showcaseState.activeScene === 5) {
          whiteOp = 0
        } else if (isHeaderVisible) {
          whiteOp = 1
        }

        const isShutterActive = showcaseState.shutterPhase === 'closing' || showcaseState.shutterPhase === 'closed' || showcaseState.shutterPhase === 'opening'
        const isWhiteActive = isHeaderVisible || (isScene5Active && whiteOp > 0.01)
        const isTransitioningWhite = isPortal || isDirectScene1To5 || isDirectScene2To5 || isScene2To3Portal || isScene1To3Portal || isShutterActive

        if (isTransitioningWhite) {
          headerRef.current.style.visibility = isWhiteActive ? 'visible' : 'hidden'
          headerRef.current.style.transition = 'none'
          headerRef.current.style.transform = (isWhiteActive || isShutterActive) ? 'translateY(0)' : 'translateY(calc(-100% - 1.5rem))'
          headerRef.current.style.opacity = isWhiteActive ? whiteOp.toFixed(3) : '0'
          headerRef.current.style.pointerEvents = (isWhiteActive && whiteOp > 0.5) ? 'auto' : 'none'
          if ('inert' in headerRef.current) {
            headerRef.current.inert = !isWhiteActive || whiteOp <= 0.5
          }
          lastWhiteActiveRef.current = isWhiteActive
        } else if (isScene5Active) {
          headerRef.current.style.visibility = whiteOp > 0.01 ? 'visible' : 'hidden'
          headerRef.current.style.transition = 'none'
          headerRef.current.style.transform = 'translateY(0)'
          headerRef.current.style.opacity = whiteOp.toFixed(3)
          headerRef.current.style.pointerEvents = whiteOp > 0.5 ? 'auto' : 'none'
          if ('inert' in headerRef.current) {
            headerRef.current.inert = whiteOp <= 0.5
          }
          lastWhiteActiveRef.current = whiteOp > 0.01
        } else {
          headerRef.current.style.visibility = 'visible'
          if (lastWhiteActiveRef.current === null) {
            lastWhiteActiveRef.current = isWhiteActive
            headerRef.current.style.transition = 'none'
            headerRef.current.style.transform = isWhiteActive ? 'translateY(0)' : 'translateY(calc(-100% - 1.5rem))'
            headerRef.current.style.opacity = isWhiteActive ? '1' : '0'
            headerRef.current.style.pointerEvents = isWhiteActive ? 'auto' : 'none'
            if ('inert' in headerRef.current) {
              headerRef.current.inert = !isWhiteActive
            }
          } else if (isWhiteActive !== lastWhiteActiveRef.current) {
            lastWhiteActiveRef.current = isWhiteActive
            if (isWhiteActive) {
              headerRef.current.style.transition = 'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1)'
              headerRef.current.style.transform = 'translateY(0)'
              headerRef.current.style.opacity = '1'
              headerRef.current.style.pointerEvents = 'auto'
            } else {
              headerRef.current.style.transition = 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.38s ease'
              headerRef.current.style.transform = 'translateY(calc(-100% - 1.5rem))'
              headerRef.current.style.opacity = '0'
              headerRef.current.style.pointerEvents = 'none'
            }
            if ('inert' in headerRef.current) {
              headerRef.current.inert = !isWhiteActive
            }
          }
        }

        if (isScene2To3Portal) {
          // Light header layer (z-51) clipped by expanding aperture portal outline:
          headerRef.current.style.zIndex = '51'
          const portalClip = showcaseState.portalClipPath || 'none'
          headerRef.current.style.clipPath = portalClip
          ;(headerRef.current.style as any).webkitClipPath = portalClip
        } else if (isDirectScene1To5) {
          headerRef.current.style.zIndex = '50'
          headerRef.current.style.clipPath = 'none'
          ;(headerRef.current.style as any).webkitClipPath = 'none'
        } else if (isDirectScene2To5) {
          const zeroClip = 'inset(100% 0 0 0)'
          headerRef.current.style.zIndex = '50'
          headerRef.current.style.clipPath = zeroClip
          ;(headerRef.current.style as any).webkitClipPath = zeroClip
        } else if (isScene1To3Portal || showcaseState.activeScene === 1 || showcaseState.activeScene === 3 || showcaseState.activeScene === 4 || showcaseState.activeScene === 5) {
          headerRef.current.style.zIndex = '50'
          headerRef.current.style.clipPath = 'none'
          ;(headerRef.current.style as any).webkitClipPath = 'none'
        } else {
          const zeroClip = 'inset(100% 0 0 0)'
          headerRef.current.style.zIndex = '50'
          headerRef.current.style.clipPath = zeroClip
          ;(headerRef.current.style as any).webkitClipPath = zeroClip
        }
      }

      // 1.1 Dark header (Darkroom / Scene 5): active in Scene 2, Scene 5, and portal handovers
      const isDarkroomHeaderVisible = (
        (showcaseState.activeScene === 2 && !isPortal) ||
        showcaseState.activeScene === 5 ||
        isScene2To3Portal ||
        isScene5Active ||
        isDirectScene1To5 ||
        isDirectScene2To5
      )
      if (darkroomHeaderRef.current) {
        darkroomHeaderRef.current.style.visibility = 'visible'
        let darkOp = 0
        if (isDirectScene1To5 || isDirectScene2To5) {
          darkOp = 1
        } else if (isScene5Active) {
          darkOp = Math.min(1, s5Prog)
        } else if (showcaseState.activeScene === 5) {
          darkOp = 1
        } else if (isDarkroomHeaderVisible) {
          darkOp = 1
        }

        const isShutterActive = showcaseState.shutterPhase === 'closing' || showcaseState.shutterPhase === 'closed' || showcaseState.shutterPhase === 'opening'
        const isDarkActive = isDarkroomHeaderVisible || (isScene5Active && darkOp > 0.01)
        const isTransitioningDark = isPortal || isDirectScene1To5 || isDirectScene2To5 || isScene2To3Portal || isScene1To3Portal || isShutterActive

        if (isTransitioningDark) {
          darkroomHeaderRef.current.style.transition = 'none'
          darkroomHeaderRef.current.style.transform = (isDarkActive || isShutterActive) ? 'translateY(0)' : 'translateY(calc(-100% - 1.5rem))'
          darkroomHeaderRef.current.style.opacity = isDarkActive ? darkOp.toFixed(3) : '0'
          darkroomHeaderRef.current.style.pointerEvents = (isDarkActive && darkOp > 0.5) ? 'auto' : 'none'
          if ('inert' in darkroomHeaderRef.current) {
            darkroomHeaderRef.current.inert = !isDarkActive || darkOp <= 0.5
          }
          lastDarkActiveRef.current = isDarkActive
        } else if (isScene5Active) {
          darkroomHeaderRef.current.style.transition = 'none'
          darkroomHeaderRef.current.style.transform = 'translateY(0)'
          darkroomHeaderRef.current.style.opacity = darkOp.toFixed(3)
          darkroomHeaderRef.current.style.pointerEvents = darkOp > 0.5 ? 'auto' : 'none'
          if ('inert' in darkroomHeaderRef.current) {
            darkroomHeaderRef.current.inert = darkOp <= 0.5
          }
          lastDarkActiveRef.current = darkOp > 0.01
        } else if (isDarkActive) {
          darkroomHeaderRef.current.style.transition = 'none'
          darkroomHeaderRef.current.style.transform = 'translateY(0)'
          darkroomHeaderRef.current.style.opacity = '1'
          darkroomHeaderRef.current.style.pointerEvents = 'auto'
          if ('inert' in darkroomHeaderRef.current) {
            darkroomHeaderRef.current.inert = false
          }
          lastDarkActiveRef.current = true
        } else {
          darkroomHeaderRef.current.style.transition = 'none'
          darkroomHeaderRef.current.style.transform = 'translateY(calc(-100% - 1.5rem))'
          darkroomHeaderRef.current.style.opacity = '0'
          darkroomHeaderRef.current.style.pointerEvents = 'none'
          if ('inert' in darkroomHeaderRef.current) {
            darkroomHeaderRef.current.inert = true
          }
          lastDarkActiveRef.current = false
        }

        if (isScene2To3Portal) {
          // Dark header base layer (z-50) under light header without clipping:
          darkroomHeaderRef.current.style.zIndex = '50'
          darkroomHeaderRef.current.style.clipPath = 'none'
          ;(darkroomHeaderRef.current.style as any).webkitClipPath = 'none'
        } else if (isDirectScene1To5) {
          darkroomHeaderRef.current.style.zIndex = '51'
          const portalClip = showcaseState.portalClipPath || 'none'
          darkroomHeaderRef.current.style.clipPath = portalClip
          ;(darkroomHeaderRef.current.style as any).webkitClipPath = portalClip
        } else if (isDirectScene2To5) {
          darkroomHeaderRef.current.style.zIndex = '50'
          darkroomHeaderRef.current.style.clipPath = 'none'
          ;(darkroomHeaderRef.current.style as any).webkitClipPath = 'none'
        } else if (isScene5Active) {
          darkroomHeaderRef.current.style.zIndex = '50'
          darkroomHeaderRef.current.style.clipPath = 'none'
          ;(darkroomHeaderRef.current.style as any).webkitClipPath = 'none'
        } else if ((showcaseState.activeScene === 5 || showcaseState.activeScene === 2) && isDarkActive) {
          darkroomHeaderRef.current.style.zIndex = '50'
          darkroomHeaderRef.current.style.clipPath = 'none'
          ;(darkroomHeaderRef.current.style as any).webkitClipPath = 'none'
        } else {
          darkroomHeaderRef.current.style.zIndex = '45'
          const zeroClip = 'inset(100% 0 0 0)'
          darkroomHeaderRef.current.style.clipPath = zeroClip
          ;(darkroomHeaderRef.current.style as any).webkitClipPath = zeroClip
        }
      }

      if (portalDarkHeaderRef.current) {
        const isSettledInScene5 =
          showcaseState.activeScene === 5 &&
          !showcaseState.isTransitioning &&
          showcaseState.portalPhase === 'idle' &&
          !isDirectScene1To5 &&
          showcaseState.navTargetScene !== 1 &&
          showcaseState.navTargetScene !== 2 &&
          showcaseState.navTargetScene !== 3 &&
          showcaseState.navTargetScene !== 4
        const isPortalDarkVisible = isDirectScene2To5 || isSettledInScene5
        portalDarkHeaderRef.current.style.visibility = isPortalDarkVisible ? 'visible' : 'hidden'
        portalDarkHeaderRef.current.style.opacity = isPortalDarkVisible ? '1' : '0'
        portalDarkHeaderRef.current.style.transform = isPortalDarkVisible ? 'translateY(0)' : 'translateY(calc(-100% - 1.5rem))'
        portalDarkHeaderRef.current.style.transition = 'none'
        portalDarkHeaderRef.current.style.zIndex = '51'
        const portalClip = isDirectScene2To5 ? (showcaseState.portalClipPath || 'none') : 'none'
        portalDarkHeaderRef.current.style.clipPath = isPortalDarkVisible ? portalClip : 'inset(100% 0 0 0)'
        ;(portalDarkHeaderRef.current.style as any).webkitClipPath = isPortalDarkVisible ? portalClip : 'inset(100% 0 0 0)'
        portalDarkHeaderRef.current.style.pointerEvents = isPortalDarkVisible ? 'auto' : 'none'
        if ('inert' in portalDarkHeaderRef.current) {
          portalDarkHeaderRef.current.inert = !isPortalDarkVisible
        }
      }

      if (portalWhiteHeaderRef.current) {
        const isPortalWhiteVisible = isScene1To3Portal
        portalWhiteHeaderRef.current.style.visibility = 'visible'
        portalWhiteHeaderRef.current.style.opacity = isPortalWhiteVisible ? '1' : '0'
        portalWhiteHeaderRef.current.style.transform = isPortalWhiteVisible ? 'translateY(0)' : 'translateY(calc(-100% - 1.5rem))'
        portalWhiteHeaderRef.current.style.transition = 'none'
        portalWhiteHeaderRef.current.style.zIndex = '51'
        const portalClip = showcaseState.portalClipPath || 'none'
        portalWhiteHeaderRef.current.style.clipPath = portalClip
        ;(portalWhiteHeaderRef.current.style as any).webkitClipPath = portalClip
        portalWhiteHeaderRef.current.style.pointerEvents = isPortalWhiteVisible ? 'auto' : 'none'
        if ('inert' in portalWhiteHeaderRef.current) {
          portalWhiteHeaderRef.current.inert = !isPortalWhiteVisible
        }
      }

      // Boot prompt "Scroll to Power On": hides on scroll offset or scene transition
      if (bootPromptRef.current) {
        const isHidden = !showcaseState.isReady
          ? false
          : Boolean(
              showcaseState.activeScene > 1 ||
              showcaseState.navTargetScene > 1 ||
              showcaseState.offset > 0.04 ||
              p > 0.04 ||
              (showcaseState.scrollEl && showcaseState.scrollEl.scrollTop > 40)
            )
        bootPromptRef.current.style.opacity = isHidden ? '0' : '1'
        bootPromptRef.current.style.transform = isHidden ? 'translateY(16px)' : 'translateY(0)'
        bootPromptRef.current.style.pointerEvents = isHidden ? 'none' : 'auto'
        bootPromptRef.current.style.visibility = isHidden ? 'hidden' : 'visible'
        if ('inert' in bootPromptRef.current) {
          bootPromptRef.current.inert = isHidden
        }
      }

      if (mobileDockRef.current) {
        const isDockVisible = (
          (isScene1 && p >= 0.14) ||
          showcaseState.activeScene === 2 ||
          showcaseState.activeScene === 3 ||
          showcaseState.activeScene === 4 ||
          showcaseState.activeScene === 5 ||
          showcaseState.navTargetScene >= 2 ||
          (showcaseState.navTargetScene === 1 && isPortal)
        )
        const isBlockedTransition = (
          showcaseState.isTransitioning ||
          showcaseState.portalPhase !== 'idle' ||
          (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
          showcaseState.scene5Phase !== 'idle' ||
          showcaseState.scene4Phase !== 'idle' ||
          (typeof showcaseState.canTriggerTransition === 'function' && !showcaseState.canTriggerTransition())
        )
        const canInteractWithDock = isDockVisible && !isShutterClosingOrClosed && !isBlockedTransition

        mobileDockRef.current.style.visibility = 'visible'

        if (lastDockVisibleRef.current === null) {
          lastDockVisibleRef.current = isDockVisible
          mobileDockRef.current.style.transition = 'none'
          mobileDockRef.current.style.transform = isDockVisible ? 'translateY(0)' : 'translateY(calc(100% + 1.5rem))'
          mobileDockRef.current.style.opacity = isDockVisible ? '1' : '0'
          mobileDockRef.current.style.pointerEvents = canInteractWithDock ? 'auto' : 'none'
          if ('inert' in mobileDockRef.current) {
            mobileDockRef.current.inert = !canInteractWithDock
          }
        } else if (isDockVisible !== lastDockVisibleRef.current) {
          lastDockVisibleRef.current = isDockVisible
          if (isDockVisible) {
            mobileDockRef.current.style.transition = 'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1)'
            mobileDockRef.current.style.transform = 'translateY(0)'
            mobileDockRef.current.style.opacity = '1'
            mobileDockRef.current.style.pointerEvents = canInteractWithDock ? 'auto' : 'none'
          } else {
            // Mobile dock slide-down transition matching desktop timing
            mobileDockRef.current.style.transition = 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.38s ease'
            mobileDockRef.current.style.transform = 'translateY(calc(100% + 1.5rem))'
            mobileDockRef.current.style.opacity = '0'
            mobileDockRef.current.style.pointerEvents = 'none'
          }
          if ('inert' in mobileDockRef.current) {
            mobileDockRef.current.inert = !canInteractWithDock
          }
        } else {
          mobileDockRef.current.style.pointerEvents = canInteractWithDock ? 'auto' : 'none'
          if ('inert' in mobileDockRef.current) {
            mobileDockRef.current.inert = !canInteractWithDock
          }
        }
      }

      if (lightDockRef.current && darkDockRef.current) {
        const portalClip = showcaseState.portalClipPath || 'none'
        const dockRect = (mobileDockRef.current || lightDockRef.current).getBoundingClientRect()
        const localClip = convertViewportPolygonToLocal(portalClip, dockRect.left, dockRect.top)

        const hideDock = (el: HTMLElement | null) => {
          if (!el) return
          el.style.visibility = 'hidden'
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          el.style.clipPath = 'none'
          ;(el.style as any).webkitClipPath = 'none'
          if ('inert' in el) el.inert = true
        }

        const showDock = (el: HTMLElement | null, zIndex: string, clip: string = 'none', op: number = 1) => {
          if (!el) return
          el.style.visibility = op > 0.01 ? 'visible' : 'hidden'
          el.style.opacity = op.toFixed(3)
          el.style.zIndex = zIndex
          el.style.clipPath = clip
          ;(el.style as any).webkitClipPath = clip
          el.style.pointerEvents = op > 0.5 ? 'auto' : 'none'
          if ('inert' in el) el.inert = op <= 0.5
        }

        if (isDirectScene1To5) {
          // 1 <-> 5: Light base (Tab 1), Dark portal overlay (Tab 5) clipped to portal geometry
          showDock(lightDockRef.current, '1', 'none', 1)
          showDock(darkDockRef.current, '2', localClip, 1)
          hideDock(portalDarkDockRef.current)
          hideDock(portalLightDockRef.current)
        } else if (isScene2To3Portal) {
          // 2 <-> 3: Dark base (Tab 2), Light portal overlay (Tab 3) clipped to portal geometry
          showDock(darkDockRef.current, '1', 'none', 1)
          showDock(lightDockRef.current, '2', localClip, 1)
          hideDock(portalDarkDockRef.current)
          hideDock(portalLightDockRef.current)
        } else if (isDirectScene2To5) {
          // 2 <-> 5: Dark base (Tab 2), Dark portal overlay (Tab 5) clipped to portal geometry
          showDock(darkDockRef.current, '1', 'none', 1)
          showDock(portalDarkDockRef.current, '2', localClip, 1)
          hideDock(lightDockRef.current)
          hideDock(portalLightDockRef.current)
        } else if (isScene1To3Portal) {
          // 1 <-> 3: Light base (Tab 1), Light portal overlay (Tab 3) clipped to portal geometry
          showDock(lightDockRef.current, '1', 'none', 1)
          showDock(portalLightDockRef.current, '2', localClip, 1)
          hideDock(darkDockRef.current)
          hideDock(portalDarkDockRef.current)
        } else if (isScene5Active) {
          // Transition 3/4 <-> 5: smooth continuous scroll crossfade
          hideDock(portalDarkDockRef.current)
          hideDock(portalLightDockRef.current)
          const darkDockRatio = Math.max(0, Math.min(1, s5Prog))
          const lightDockOp = Math.max(0, Math.min(1, 1.0 - darkDockRatio))
          const darkDockOp = Math.max(0, Math.min(1, darkDockRatio))
          showDock(lightDockRef.current, '1', 'none', lightDockOp)
          showDock(darkDockRef.current, '2', 'none', darkDockOp)
        } else {
          // Static scene mode and shutter states
          hideDock(portalDarkDockRef.current)
          hideDock(portalLightDockRef.current)
          const isDark = (
            showcaseState.activeScene === 2 ||
            showcaseState.activeScene === 5 ||
            darkroomActive ||
            (showcaseState.navTargetScene === 2 && showcaseState.shutterPhase === 'closed')
          )
          if (isDark) {
            showDock(darkDockRef.current, '2', 'none', 1)
            hideDock(lightDockRef.current)
          } else {
            showDock(lightDockRef.current, '2', 'none', 1)
            hideDock(darkDockRef.current)
          }
        }
      }

      // Block 1 exit timing during portal opening (1 -> 3 / 4 / 5):
      if (isScene1Portal && showcaseState.portalPhase === 'opening') {
        if (card1ExitStartTimeRef.current === null) {
          card1ExitStartTimeRef.current = now
          const minTextP = isMobile ? 0.20 : 0.19
          const wasActuallyVisible = Boolean(
            p >= minTextP &&
            (cardActiveRef.current.card1 || card1ParaProgRef.current > 0.05)
          )
          card1WasVisibleAtPortalStartRef.current = wasActuallyVisible
          card1InitialOpacityRef.current = wasActuallyVisible ? (parseFloat(card1Ref.current?.style.opacity || '1') || 1) : 0
          card1ParaInitialProgRef.current = wasActuallyVisible ? card1ParaProgRef.current : 0
        }
      } else {
        card1ExitStartTimeRef.current = null
        card1WasVisibleAtPortalStartRef.current = false
        card1InitialOpacityRef.current = 0
        card1ParaInitialProgRef.current = 0
      }
      const exitElapsed = card1ExitStartTimeRef.current !== null ? (now - card1ExitStartTimeRef.current) : 0

      // Text decoding activation for Block 1 (HackyText, AnimatedLine):
      // On 1 -> 3 / 4 transitions, immediately trigger reverse decoding and line collapse.
      // On return to Scene 1 (portal closing <= 0.35), trigger line expansion and forward text decode.
      const minC1P = isMobile ? 0.20 : 0.19
      const isC1 = isScene1Portal
        ? (showcaseState.portalPhase === 'closing' && showcaseState.portalTargetScene === 1 && portalProg <= 0.35)
        : (isScene1 && (p >= minC1P || showcaseState.shutterPhase === 'closed' || showcaseState.shutterPhase === 'opening'))
      if (isC1 !== cardActiveRef.current.card1) {
        cardActiveRef.current.card1 = isC1
        setCardActive({ card1: isC1 })
      }

      // Block 1 (Hero / Official Flagship):
      // Smooth decode and fade transitions during 1 <-> 3 / 4 / 5
      if (card1Ref.current) {
        if (isScene1Portal) {
          if (showcaseState.portalPhase === 'opening') {
            if (!card1WasVisibleAtPortalStartRef.current) {
              card1Ref.current.style.visibility = 'hidden'
              card1Ref.current.style.opacity = '0'
              card1Ref.current.style.transform = 'translateY(0px)'
              card1Ref.current.style.pointerEvents = 'none'
            } else {
              // Transition 1 -> 3 / 4 / 5:
              // Synchronized exit: reverse glyph decoding (~360ms)
              // with gentle fade-out at the tail of the animation (300-440ms)
              const EXIT_DURATION = 440
              const FADE_START = 300
              let opRatio = 1
              if (exitElapsed <= FADE_START) {
                opRatio = 1
              } else if (exitElapsed < EXIT_DURATION) {
                const fadeT = (exitElapsed - FADE_START) / (EXIT_DURATION - FADE_START)
                opRatio = 1 - fadeT * fadeT * (3 - 2 * fadeT)
              } else {
                opRatio = 0
              }

              const isVisibleDuringExit = exitElapsed < EXIT_DURATION && card1InitialOpacityRef.current > 0
              card1Ref.current.style.visibility = isVisibleDuringExit ? 'visible' : 'hidden'
              card1Ref.current.style.opacity = (card1InitialOpacityRef.current * opRatio).toFixed(3)
              card1Ref.current.style.transform = 'translateY(0px)'
              card1Ref.current.style.pointerEvents = 'none'
            }
          } else if (showcaseState.portalPhase === 'closing') {
            // Transition 3 / 4 / 5 -> 1:
            // Reveal on return to Scene 1 as portal nears closure
            const isVisibleDuringEnter = portalProg <= 0.35
            card1Ref.current.style.visibility = isVisibleDuringEnter ? 'visible' : 'hidden'
            card1Ref.current.style.opacity = isVisibleDuringEnter ? '1' : '0'
            card1Ref.current.style.transform = 'translateY(0px)'
            card1Ref.current.style.pointerEvents = portalProg < 0.05 ? 'auto' : 'none'
          }
        } else {
          const isCard1Exiting = isMobile && isScene1 && !isC1 && card1ParaProgRef.current > 0.001
          const minCard1P = isMobile ? 0.14 : 0.08
          const isCard1Visible = isScene1 && (
            p >= minCard1P ||
            isCard1Exiting ||
            showcaseState.shutterPhase === 'closed' ||
            showcaseState.shutterPhase === 'opening'
          )
          card1Ref.current.style.visibility = isCard1Visible ? 'visible' : 'hidden'
          if (isCard1Visible) {
            if (isCard1Exiting) {
              card1Ref.current.style.opacity = '1'
              card1Ref.current.style.transform = `translateY(0px)`
            } else if (p < 0.14 && showcaseState.shutterPhase === 'idle') {
              const entryT = Math.max(0, Math.min(1, (p - 0.08) / (0.14 - 0.08)))
              const entrySmooth = entryT * entryT * (3 - 2 * entryT)
              card1Ref.current.style.opacity = entrySmooth.toFixed(3)
              card1Ref.current.style.transform = `translateY(0px)`
            } else {
              card1Ref.current.style.opacity = '1'
              card1Ref.current.style.transform = `translateY(0px)`
            }
            card1Ref.current.style.pointerEvents = isCard1Exiting ? 'none' : 'auto'
          } else {
            card1Ref.current.style.opacity = '0'
            card1Ref.current.style.pointerEvents = 'none'
          }
        }
      }

      // Block 1 description paragraph:
      if (card1ParaRef.current) {
        if (isScene1Portal) {
          if (showcaseState.portalPhase === 'opening') {
            if (!card1WasVisibleAtPortalStartRef.current) {
              card1ParaRef.current.style.opacity = '0'
              card1ParaRef.current.style.transform = 'translateY(40px)'
              card1ParaProgRef.current = 0
            } else {
              // Transition 1 -> 3 / 4 / 5: Slides down and fades out synchronously (~300ms)
              const DURATION_MS = 300
              const t = card1ParaInitialProgRef.current * Math.max(0, 1 - exitElapsed / DURATION_MS)
              card1ParaProgRef.current = t
              const smooth = t * t * (3 - 2 * t)
              const y = (1 - smooth) * 40
              card1ParaRef.current.style.transform = `translateY(${y.toFixed(1)}px)`
              card1ParaRef.current.style.opacity = smooth.toFixed(3)
            }
          } else if (showcaseState.portalPhase === 'closing') {
            // Transition 3 / 4 / 5 -> 1: Slides up on return (0.35 -> 0.0)
            const t = Math.max(0, Math.min(1, (0.35 - portalProg) / 0.35))
            card1ParaProgRef.current = t
            const smooth = t * t * (3 - 2 * t)
            const y = (1 - smooth) * 40
            card1ParaRef.current.style.transform = `translateY(${y.toFixed(1)}px)`
            card1ParaRef.current.style.opacity = smooth.toFixed(3)
          }
        } else {
          // Entrance speed matching Scene 3 (280ms).
          // Continuous entrance once triggered at p >= 0.19 (0.20 on mobile),
          // animating smoothly to 100% without stalling mid-way,
          // and gracefully resetting back to zero on scroll back to standby.
          // Under closed shutter transitions, content is already positioned at progress = 1.0:
          const isShutterEnteringScene1 = isScene1 && (
            showcaseState.shutterPhase === 'closed' || showcaseState.shutterPhase === 'opening'
          )
          if (isShutterEnteringScene1) {
            card1ParaProgRef.current = 1.0
          } else if (!isScene1) {
            card1ParaProgRef.current = 0.0
          }

          const minParaP = isMobile ? 0.20 : 0.19
          const target = (isShutterEnteringScene1 || (isScene1 && p >= minParaP)) ? 1.0 : 0.0
          const isExiting = card1ParaProgRef.current > target
          const DURATION_MS = (isMobile && isExiting) ? 360 : 280
          const step = dt / DURATION_MS
          if (card1ParaProgRef.current < target) {
            card1ParaProgRef.current = Math.min(target, card1ParaProgRef.current + step)
          } else if (card1ParaProgRef.current > target) {
            card1ParaProgRef.current = Math.max(target, card1ParaProgRef.current - step)
          }
          const t = isShutterEnteringScene1 ? 1.0 : card1ParaProgRef.current
          const smooth = t * t * (3 - 2 * t)
          const y = (1 - smooth) * 40
          card1ParaRef.current.style.transform = `translateY(${y.toFixed(1)}px)`
          card1ParaRef.current.style.opacity = smooth.toFixed(3)
        }
      }

      if (darkroomActive !== isDarkroomVisibleRef.current) {
        isDarkroomVisibleRef.current = darkroomActive
        setIsDarkroomVisible(darkroomActive)
      }

      if (isScene1 && p < minC1P) {
        if (showcaseState.isScene1TextComplete || isCard1TextCompleteRef.current) {
          showcaseState.isScene1TextComplete = false
          isCard1TextCompleteRef.current = false
          pendingScene2TransitionRef.current = false
          if (pendingScene2TimerRef.current) {
            clearTimeout(pendingScene2TimerRef.current)
            pendingScene2TimerRef.current = null
          }
        }
      }

      // Natural scroll scene transition check (with protective hysteresis)
      if (!showcaseState.isTransitioning && showcaseState.isReady && showcaseState.portalPhase === 'idle') {
        if (showcaseState.activeScene === 1 && p >= 0.45) {
          const isMobile = typeof window !== 'undefined' && window.innerWidth <= 880
          if (isMobile && !showcaseState.isScene1TextComplete) {
            requestScene2TransitionFromMobile()
            return
          }
          showcaseState.triggerTransition(2, 'scroll')
        } else if (showcaseState.activeScene === 2) {
          if (p <= 0.55) {
            showcaseState.triggerTransition(1)
          }
        }
      }

      // Dynamic Audio Modulation & Auto Boot Chime on Scroll past Standby
      if (!hasBootChimedRef.current && p >= 0.08) {
        hasBootChimedRef.current = true
        trackEvent('boot_power_on', { timestamp: Date.now() })
        soundManager.playBootChime()
        soundManager.startAmbient()
      }
      const currentAmbientScene = (showcaseState.isTransitioning && showcaseState.shutterPhase === 'closing')
        ? showcaseState.activeScene
        : (showcaseState.navTargetScene || showcaseState.activeScene)
      soundManager.updateAmbient(currentAmbientScene, showcaseState.velocity, p, showcaseState.shutterPhase)

      animId = requestAnimationFrame(onFrame)
    }

    animId = requestAnimationFrame(onFrame)
    return () => {
      cancelAnimationFrame(animId)
      if (pendingScene2TimerRef.current) clearTimeout(pendingScene2TimerRef.current)
    }
  }, [mounted])
}
