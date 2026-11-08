'use client'

import React, { useEffect } from 'react'
import gsap from 'gsap'
import { showcaseState, getScrollElement } from '../3d/deckState'
import { soundManager } from '../../audio/soundEngine'

export interface UseOverlayInteractionsProps {
  arrowLeftHeldRef: React.MutableRefObject<boolean>
  arrowRightHeldRef: React.MutableRefObject<boolean>
  arrowDownHeldRef: React.MutableRefObject<boolean>
  arrowUpHeldRef: React.MutableRefObject<boolean>
  requestScene2TransitionFromMobile: () => void
}

export function useOverlayInteractions({
  arrowLeftHeldRef,
  arrowRightHeldRef,
  arrowDownHeldRef,
  arrowUpHeldRef,
  requestScene2TransitionFromMobile,
}: UseOverlayInteractionsProps) {
  // Strict scroll interception and threshold-based scene routing
  useEffect(() => {
    let scene3ScrollDownAcc = 0
    let scene3ScrollDownTimer: ReturnType<typeof setTimeout> | null = null
    let scene3ScrollUpSpeed = 0
    let scene3LastScrollUpTime = 0
    let scene4ScrollAcc = 0
    let scene4ScrollTimer: ReturnType<typeof setTimeout> | null = null
    let scene4ScrollUpSpeed = 0
    let scene4LastScrollUpTime = 0
    let scene4ScrollDownAcc = 0
    let scene4ScrollDownTimer: ReturnType<typeof setTimeout> | null = null
    let scene5ScrollUpAcc = 0
    let scene5ScrollUpTimer: ReturnType<typeof setTimeout> | null = null
    let scene5EnterTime = 0

    const unsubScene = showcaseState.onActiveSceneChange((s) => {
      if (s === 5) {
        scene5EnterTime = performance.now()
      } else {
        scene5EnterTime = 0
      }
    })

    const onGlobalWheel = (e: WheelEvent) => {
      if (!showcaseState.isReady) {
        e.preventDefault()
        return
      }
      if (showcaseState.isTransitioning) {
        if (showcaseState.portalPhase === 'closing' && e.deltaY < 0) {
          // Allow interactive ring rotation during portal closure:
          showcaseState.addRingRotationImpulse(e.deltaY * 0.0035, true)
        }
        e.preventDefault()
        return
      }
      const el = showcaseState.scrollEl
      if (!el) return

      const maxScroll = el.scrollHeight - el.clientHeight
      const currentP = maxScroll > 0 ? el.scrollTop / maxScroll : 0

      // Scene 1 (Hero Overview): scroll down triggers shutter cut to Scene 2
      if (showcaseState.activeScene === 1) {
        if (currentP >= 0.44 || el.scrollTop >= maxScroll * 0.44) {
          if (e.deltaY > 0) {
            e.preventDefault()
            el.scrollTop = maxScroll * 0.45
            showcaseState.triggerTransition(2)
            return
          }
        }
      }

      // Scene 2 (OLED Display Darkroom):
      if (showcaseState.activeScene === 2) {
        // Scroll up returns to Scene 1 via shutter:
        if (currentP <= 0.60 || el.scrollTop <= maxScroll * 0.60) {
          if (e.deltaY < 0) {
            e.preventDefault()
            el.scrollTop = maxScroll * 0.58
            showcaseState.triggerTransition(1)
            return
          }
        }
        // Scroll down triggers aperture portal to Scene 3:
        if (e.deltaY > 15) {
          e.preventDefault()
          showcaseState.triggerPortalTransition(3)
          return
        }
      }

      // Scene 3 (Steam Library 3D Ring):
      if (showcaseState.activeScene === 3) {
        // Horizontal gesture priority for ring rotation:
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) + 5) {
          e.preventDefault()
          const impulse = e.deltaX * 0.0035
          showcaseState.addRingRotationImpulse(impulse, true)
          return
        }

        // Scroll down (e.deltaY > 0) -> transition to Scene 4 (Fullscreen Immersion):
        if (e.deltaY > 0) {
          scene3ScrollDownAcc += e.deltaY
          if (scene3ScrollDownTimer) clearTimeout(scene3ScrollDownTimer)
          scene3ScrollDownTimer = setTimeout(() => {
            scene3ScrollDownAcc = 0
          }, 200)

          if (scene3ScrollDownAcc >= 60) {
            e.preventDefault()
            scene3ScrollDownAcc = 0
            showcaseState.triggerTransition(4)
            return
          }

          // Accumulate downward scroll to advance scene, otherwise rotate ring:
          e.preventDefault()
          showcaseState.addRingRotationImpulse(e.deltaY * 0.0035, true)
          return
        }

        // Rotate ring in reverse; trigger Scene 2 transition if reverse velocity threshold is reached (~2.4 rad/s).
        if (e.deltaY < 0) {
          e.preventDefault()

          const now = performance.now()
          const dt = scene3LastScrollUpTime > 0 ? (now - scene3LastScrollUpTime) / 1000 : 0
          scene3LastScrollUpTime = now

          // Decay reverse scroll speed across gesture pauses:
          if (dt > 0) {
            scene3ScrollUpSpeed *= Math.exp(-2.2 * Math.min(dt, 1.2))
          }

          // Velocity accumulation strictly from vertical upward scroll:
          const speedDelta = Math.abs(e.deltaY) * 0.0084
          scene3ScrollUpSpeed += speedDelta

          // Apply reverse rotational impulse to planet ring:
          const impulse = e.deltaY * 0.0035
          showcaseState.addRingRotationImpulse(impulse, true)

          // Trigger Scene 2 transition only when reverse velocity threshold is met:
          if (
            !showcaseState.isTransitioning &&
            showcaseState.portalPhase === 'idle' &&
            scene3ScrollUpSpeed >= 2.4 &&
            showcaseState.ringVelocity <= -1.6
          ) {
            scene3ScrollUpSpeed = 0
            scene3LastScrollUpTime = 0
            showcaseState.triggerPortalTransition(2, undefined, undefined, 'scroll')
          }
          return
        }
        return
      }

      // Scene 4 (Fullscreen Immersion):
      if (showcaseState.activeScene === 4) {
        if (e.deltaY < 0) {
          // Scroll up: rotate ring/ribbon in reverse:
          e.preventDefault()
          const impulse = e.deltaY * 0.0035
          showcaseState.addRingRotationImpulse(impulse, true)

          scene4ScrollAcc += e.deltaY
          if (scene4ScrollTimer) clearTimeout(scene4ScrollTimer)
          scene4ScrollTimer = setTimeout(() => {
            scene4ScrollAcc = 0
            scene4ScrollUpSpeed = 0
          }, 240)

          const now = performance.now()
          const dt = scene4LastScrollUpTime > 0 ? (now - scene4LastScrollUpTime) / 1000 : 0.05
          scene4LastScrollUpTime = now
          const scrollSpeed = Math.abs(e.deltaY) / Math.max(0.016, dt)
          scene4ScrollUpSpeed = scene4ScrollUpSpeed * 0.7 + scrollSpeed * 0.3

          // Return to Scene 3 when reverse speed or accumulated scroll exceeds threshold:
          if (
            !showcaseState.isTransitioning &&
            (scene4ScrollUpSpeed >= 2.0 || scene4ScrollAcc < -60) &&
            showcaseState.ringVelocity <= -1.2
          ) {
            scene4ScrollUpSpeed = 0
            scene4LastScrollUpTime = 0
            scene4ScrollAcc = 0
            showcaseState.triggerTransition(3)
          }
          return
        }

        // Scroll down: advance to Scene 5 (Rhythm Highway & Specs):
        if (e.deltaY > 0) {
          scene4ScrollDownAcc += e.deltaY
          if (scene4ScrollDownTimer) clearTimeout(scene4ScrollDownTimer)
          scene4ScrollDownTimer = setTimeout(() => {
            scene4ScrollDownAcc = 0
          }, 240)

          if (scene4ScrollDownAcc >= 65 && !showcaseState.isTransitioning) {
            scene4ScrollDownAcc = 0
            showcaseState.triggerTransition(5, 'scroll')
            return
          }

          if (e.deltaY > 5 && showcaseState.addRingRotationImpulse) {
            showcaseState.addRingRotationImpulse(e.deltaY * 0.0035, true)
          }
          e.preventDefault()
          return
        }
        return
      }

      // Scene 5 (Cinematic roadmap & specs):
      if (showcaseState.activeScene === 5) {
        e.preventDefault()

        if (showcaseState.addScene5ScrollImpulse) {
          showcaseState.addScene5ScrollImpulse(e.deltaY * 0.9)
          return
        }

        if (e.deltaY < 0 && !showcaseState.isTransitioning) {
          // Prevent trackpad inertia bounce: require 350ms minimum residency before exit
          if (scene5EnterTime > 0 && performance.now() - scene5EnterTime < 350) {
            return
          }

          scene5ScrollUpAcc += e.deltaY
          if (scene5ScrollUpTimer) clearTimeout(scene5ScrollUpTimer)
          scene5ScrollUpTimer = setTimeout(() => { scene5ScrollUpAcc = 0 }, 280)
          if (scene5ScrollUpAcc <= -65) {
            scene5ScrollUpAcc = 0
            scene5EnterTime = 0
            showcaseState.triggerTransition(4)
          }
          return
        }
        return
      }

      const target = e.target as any
      const isNestedScrollable = target && target instanceof HTMLElement && target !== el && (target.scrollHeight > target.clientHeight) && (window.getComputedStyle(target).overflowY === 'auto' || window.getComputedStyle(target).overflowY === 'scroll')
      if (!isNestedScrollable) {
        el.scrollTop += e.deltaY
      }
    }

    // Touch Swipe gesture support
    let touchStartX = 0
    let touchStartY = 0
    let touchLastX = 0
    let touchLastY = 0
    let touchLastTime = 0
    let touchVelocityX = 0
    let touchVelocityY = 0
    let isRingDragging = false
    let isCurtainTouch = false
    let scene1ScrollTween: gsap.core.Tween | null = null

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      touchLastX = touchStartX
      touchLastY = touchStartY
      touchLastTime = performance.now()
      touchVelocityX = 0
      touchVelocityY = 0
      if (scene1ScrollTween) {
        scene1ScrollTween.kill()
        scene1ScrollTween = null
      }
      isRingDragging = (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) && !showcaseState.isTransitioning
      if (isRingDragging) {
        showcaseState.isHoldingRing = true
      }

      if (showcaseState.activeScene === 2) {
        const target = e.target as HTMLElement | null
        const isCurtainEl = !!target?.closest('[data-curtain]')
        const winW = window.innerWidth
        const winH = window.innerHeight
        const bounds = showcaseState.screenBounds
        const xRel = touchStartX / Math.max(1, winW)
        const yRel = touchStartY / Math.max(1, winH)
        const isInsideScreen =
          xRel >= bounds.left - 0.08 &&
          xRel <= bounds.right + 0.08 &&
          yRel >= bounds.top - 0.10 &&
          yRel <= bounds.bottom + 0.10

        isCurtainTouch = isCurtainEl || isInsideScreen || showcaseState.isCurtainDragging
      } else {
        isCurtainTouch = false
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const now = performance.now()
      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const dx = currentX - touchLastX
      const dy = currentY - touchLastY
      const dt = Math.max(1, now - touchLastTime)
      const instVx = dx / (dt / 1000)
      const instVy = dy / (dt / 1000)
      touchVelocityX = touchVelocityX * 0.35 + instVx * 0.65
      touchVelocityY = touchVelocityY * 0.35 + instVy * 0.65
      touchLastX = currentX
      touchLastY = currentY
      touchLastTime = now

      // Scene 1 mobile touch assist: responsive and direct 1:1 motion like a trackpad
      if (showcaseState.activeScene === 1 && !showcaseState.isTransitioning) {
        const isMobile = window.innerWidth <= 880
        if (isMobile) {
          const el = getScrollElement()
          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight
            if (maxScroll > 0) {
              const boost = -dy * 1.5
              el.scrollTop = Math.max(0, Math.min(maxScroll * 0.28, el.scrollTop + boost))
            }
          }
        }
      }

      if (!isRingDragging || showcaseState.isTransitioning) return
      showcaseState.isHoldingRing = true

      const totalDx = Math.abs(currentX - touchStartX)
      const totalDy = Math.abs(currentY - touchStartY)
      if (totalDx >= totalDy * 0.75 && Math.abs(dx) > 1 && showcaseState.addRingRotationImpulse) {
        showcaseState.addRingRotationImpulse(dx * -0.0008)
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      isRingDragging = false
      showcaseState.isHoldingRing = false
      if (showcaseState.isTransitioning || !showcaseState.isReady) return
      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY
      const diffX = touchEndX - touchStartX
      const diffY = touchEndY - touchStartY

      const isVerticalSwipe = Math.abs(diffY) >= 35 && Math.abs(diffY) > Math.abs(diffX) * 0.75

      // In scenes 3 and 4 (library orbit), horizontal touch drag rotates ring:
      if (!isVerticalSwipe && (showcaseState.activeScene === 3 || showcaseState.activeScene === 4)) {
        const timeSinceMove = performance.now() - touchLastTime
        const isFlick = timeSinceMove < 90 && Math.abs(touchVelocityX) > 120
        if (isFlick && showcaseState.addRingRotationImpulse) {
          const flickImpulse = Math.max(-0.22, Math.min(0.22, -touchVelocityX * 0.00010))
          showcaseState.addRingRotationImpulse(flickImpulse)
          return
        }
        return
      }

      if (showcaseState.activeScene === 1) {
        const isMobile = window.innerWidth <= 880
        const isAtHero = showcaseState.offset >= 0.24
        if (isAtHero && diffY < -35) {
          if (isMobile) {
            requestScene2TransitionFromMobile()
          } else {
            showcaseState.triggerTransition(2, 'gesture')
          }
        } else if (isMobile) {
          // Natural trackpad-like momentum glide on flick:
          const timeSinceMove = performance.now() - touchLastTime
          if (timeSinceMove < 100 && Math.abs(touchVelocityY) > 80) {
            const el = getScrollElement()
            if (el) {
              const maxScroll = el.scrollHeight - el.clientHeight
              const momentum = -touchVelocityY * 0.45
              const targetTop = Math.max(0, Math.min(maxScroll * 0.28, el.scrollTop + momentum))
              const dist = Math.abs(targetTop - el.scrollTop)
              if (dist > 15) {
                const proxy = { top: el.scrollTop }
                if (scene1ScrollTween) scene1ScrollTween.kill()
                scene1ScrollTween = gsap.to(proxy, {
                  top: targetTop,
                  duration: Math.min(0.85, Math.max(0.3, dist / 900)),
                  ease: 'power2.out',
                  onUpdate: () => {
                    if (el) el.scrollTop = proxy.top
                  },
                })
              }
            }
          }
        }
      } else if (showcaseState.activeScene === 2) {
        const now = performance.now()
        const wasRecentlyDraggingCurtain = (now - showcaseState.lastCurtainDragEndTime) < 600

        if (isCurtainTouch || showcaseState.isCurtainDragging || wasRecentlyDraggingCurtain) {
          isCurtainTouch = false
          return
        }

        if (Math.abs(diffX) > Math.abs(diffY) || Math.abs(diffX) > 20) {
          return
        }

        const isStrictlyVertical = Math.abs(diffY) >= 70 && Math.abs(diffY) >= Math.abs(diffX) * 2.0
        if (!isStrictlyVertical) {
          return
        }

        if (diffY < -70) {
          showcaseState.triggerPortalTransition(3)
        } else if (diffY > 70) {
          showcaseState.triggerTransition(1)
        }
      } else if (showcaseState.activeScene === 3) {
        if (diffY > 35) {
          showcaseState.triggerPortalTransition(2, undefined, undefined, 'gesture')
        } else if (diffY < -35) {
          showcaseState.triggerTransition(4)
        }
      } else if (showcaseState.activeScene === 4) {
        if (diffY > 35) {
          showcaseState.triggerTransition(3)
        } else if (diffY < -35) {
          showcaseState.triggerTransition(5, 'scroll')
        }
      } else if (showcaseState.activeScene === 5) {
        if (diffY > 35 && showcaseState.scene5ScrollProgress <= 0.02) {
          showcaseState.triggerTransition(4)
        }
      }
    }

    const triggerPowerOn = () => {
      const el = getScrollElement()
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight
        const target = maxScroll * 0.28
        const proxy = { top: el.scrollTop }
        gsap.killTweensOf(proxy)
        const tween = gsap.to(proxy, {
          top: target,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => {
            if (el) {
              el.scrollTop = proxy.top
              el.dispatchEvent(new Event('scroll'))
            }
          },
        })
        const cancel = () => tween.kill()
        window.addEventListener('wheel', cancel, { once: true, passive: true })
        window.addEventListener('touchmove', cancel, { once: true, passive: true })
      } else if (showcaseState.scrollTo) {
        showcaseState.scrollTo(0.28)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') return

      if (e.key === 'Tab') {
        const selector = 'button:not([disabled]), a[href], [tabindex="0"], [role="slider"], [role="button"], input, select, textarea'
        const focusable = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => {
          if (el.closest('[inert]')) return false
          const style = window.getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) return false
          let p = el.parentElement
          while (p && p !== document.body) {
            const ps = window.getComputedStyle(p)
            if (ps.display === 'none' || ps.visibility === 'hidden') return false
            p = p.parentElement
          }
          return true
        })

        if (focusable.length > 0) {
          const currentActive = document.activeElement as HTMLElement | null
          const currentIndex = currentActive ? focusable.indexOf(currentActive) : -1

          if (e.shiftKey) {
            if (currentIndex <= 0) {
              e.preventDefault()
              focusable[focusable.length - 1].focus()
              return
            }
          } else {
            if (currentIndex === -1 || currentIndex >= focusable.length - 1) {
              e.preventDefault()
              focusable[0].focus()
              return
            }
          }
        }
      }

      if (e.key === 'Escape') {
        if (showcaseState.activeScene === 4) {
          e.preventDefault()
          showcaseState.triggerTransition(3)
        }
        return
      }

      const el = getScrollElement()
      const maxScroll = el ? el.scrollHeight - el.clientHeight : 0
      const currentP = (el && maxScroll > 0) ? el.scrollTop / maxScroll : showcaseState.offset

      if (currentP < 0.05 && showcaseState.activeScene === 1) {
        if (e.key === 'PageDown' || (e.key === ' ' && activeTag !== 'button') || (e.key === 'Enter' && activeTag !== 'button' && activeTag !== 'a')) {
          e.preventDefault()
          triggerPowerOn()
          return
        }
      }

      if (e.key === 'ArrowDown' || e.key === 'Down') {
        if (showcaseState.activeScene === 1) {
          if (showcaseState.isTransitioning) return
          e.preventDefault()
          arrowDownHeldRef.current = true
          if (el && maxScroll > 0) {
            if (el.scrollTop >= maxScroll * 0.44) {
              arrowDownHeldRef.current = false
              el.scrollTop = maxScroll * 0.45
              showcaseState.triggerTransition(2)
              return
            }
            if (!e.repeat) {
              const step = Math.max(36, maxScroll * 0.012)
              const nextTop = el.scrollTop + step
              if (nextTop >= maxScroll * 0.44) {
                arrowDownHeldRef.current = false
                el.scrollTop = maxScroll * 0.45
                showcaseState.triggerTransition(2)
              } else {
                el.scrollTop = nextTop
              }
            }
          }
          return
        }
      }

      if (e.key === 'ArrowUp' || e.key === 'Up') {
        if (showcaseState.activeScene === 1) {
          if (showcaseState.isTransitioning) return
          e.preventDefault()
          arrowUpHeldRef.current = true
          if (el) {
            if (!e.repeat) {
              const step = maxScroll > 0 ? Math.max(36, maxScroll * 0.012) : 36
              el.scrollTop = Math.max(0, el.scrollTop - step)
            }
          }
          return
        }
      }

      if (e.key === 'ArrowDown' || e.key === 'Down' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey && activeTag !== 'button')) {
        if (showcaseState.isTransitioning) return
        e.preventDefault()

        if (showcaseState.activeScene === 1) {
          if (el && maxScroll > 0) el.scrollTop = maxScroll * 0.45
          showcaseState.triggerTransition(2)
        } else if (showcaseState.activeScene === 2) {
          showcaseState.triggerPortalTransition(3)
        } else if (showcaseState.activeScene === 3) {
          showcaseState.triggerTransition(4)
        } else if (showcaseState.activeScene === 4) {
          showcaseState.triggerTransition(5, 'scroll')
        } else if (showcaseState.activeScene === 5) {
          if (showcaseState.addScene5ScrollImpulse) {
            showcaseState.addScene5ScrollImpulse(e.key === 'PageDown' ? 240 : 120)
          }
        }
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'Up' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey && activeTag !== 'button')) {
        if (showcaseState.isTransitioning) return
        e.preventDefault()

        if (showcaseState.activeScene === 5) {
          if (showcaseState.scene5ScrollProgress <= 0.02) {
            showcaseState.triggerTransition(4)
          } else if (showcaseState.addScene5ScrollImpulse) {
            showcaseState.addScene5ScrollImpulse(e.key === 'PageUp' ? -240 : -120)
          }
        } else if (showcaseState.activeScene === 4) {
          showcaseState.triggerTransition(3)
        } else if (showcaseState.activeScene === 3) {
          showcaseState.triggerTransition(2)
        } else if (showcaseState.activeScene === 2) {
          if (el && maxScroll > 0) el.scrollTop = maxScroll * 0.42
          showcaseState.triggerTransition(1)
        } else if (showcaseState.activeScene === 1) {
          if (el) {
            gsap.to(el, { scrollTop: 0, duration: 1.2, ease: 'power2.out' })
          }
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        arrowLeftHeldRef.current = true
        if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) {
          e.preventDefault()
          showcaseState.addRingRotationImpulse(-0.35)
        } else if (showcaseState.activeScene === 2 && activeTag !== 'button') {
          e.preventDefault()
          if (!e.repeat) {
            showcaseState.setSplitPos(Math.max(0, showcaseState.splitPos - 0.02))
          }
        }
      } else if (e.key === 'ArrowRight') {
        arrowRightHeldRef.current = true
        if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4) {
          e.preventDefault()
          showcaseState.addRingRotationImpulse(0.35)
        } else if (showcaseState.activeScene === 2 && activeTag !== 'button') {
          e.preventDefault()
          if (!e.repeat) {
            showcaseState.setSplitPos(Math.min(1, showcaseState.splitPos + 0.02))
          }
        }
      } else if (e.key === 'Home') {
        if (showcaseState.activeScene !== 1 && !showcaseState.isTransitioning) {
          e.preventDefault()
          showcaseState.triggerTransition(1)
        }
      } else if (e.key === 'End') {
        if (showcaseState.activeScene !== 5 && !showcaseState.isTransitioning) {
          e.preventDefault()
          showcaseState.triggerTransition(5, 'click')
        }
      }

      // Direct scene jumping via keys 1, 2, 3, 4 (Awwwards Jury keyboard navigation):
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
          if (showcaseState.activeScene !== 1 && !showcaseState.isTransitioning) {
            e.preventDefault()
            soundManager.playButtonClick()
            showcaseState.triggerTransition(1)
          } else if (showcaseState.activeScene === 1) {
            const el = getScrollElement()
            if (el && el.scrollTop > 0) {
              e.preventDefault()
              soundManager.playButtonClick()
              gsap.to(el, { scrollTop: 0, duration: 0.8, ease: 'power2.out' })
            }
          }
        } else if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
          if (showcaseState.activeScene !== 2 && !showcaseState.isTransitioning) {
            e.preventDefault()
            soundManager.playButtonClick()
            showcaseState.triggerTransition(2)
          }
        } else if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') {
          if (showcaseState.activeScene !== 3 && !showcaseState.isTransitioning) {
            e.preventDefault()
            soundManager.playButtonClick()
            showcaseState.triggerTransition(3)
          }
        } else if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') {
          if (showcaseState.activeScene !== 5 && !showcaseState.isTransitioning) {
            e.preventDefault()
            soundManager.playButtonClick()
            showcaseState.triggerTransition(5, 'click')
          }
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        arrowLeftHeldRef.current = false
      } else if (e.key === 'ArrowRight') {
        arrowRightHeldRef.current = false
      } else if (e.key === 'ArrowDown' || e.key === 'Down') {
        arrowDownHeldRef.current = false
      } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        arrowUpHeldRef.current = false
      }
    }

    const onBlur = () => {
      arrowLeftHeldRef.current = false
      arrowRightHeldRef.current = false
      arrowDownHeldRef.current = false
      arrowUpHeldRef.current = false
      isRingDragging = false
      showcaseState.isHoldingRing = false
    }

    const onTouchCancel = () => {
      isRingDragging = false
      showcaseState.isHoldingRing = false
    }

    const unlockAudio = () => {
      soundManager.unlock()
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('touchstart', unlockAudio, { passive: true })

    window.addEventListener('wheel', onGlobalWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      unsubScene()
      if (scene3ScrollDownTimer) clearTimeout(scene3ScrollDownTimer)
      if (scene4ScrollTimer) clearTimeout(scene4ScrollTimer)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
      window.removeEventListener('wheel', onGlobalWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [arrowDownHeldRef, arrowLeftHeldRef, arrowRightHeldRef, arrowUpHeldRef, requestScene2TransitionFromMobile])
}
