'use client'

import React from 'react'
import { LinkHover } from './LinkHover'
import { showcaseState } from '../3d/deckState'
import { isMouseOverNavTab } from './navigationUtils'

export interface DockLayerProps {
  dockRef: React.RefObject<HTMLDivElement | null>
  theme: 'light' | 'dark'
  activeTab: number
  hoveredNav: number | null
  setHoveredNav: React.Dispatch<React.SetStateAction<number | null>>
  isAbsolute?: boolean
}

export function DockLayer({
  dockRef,
  theme,
  activeTab,
  hoveredNav,
  setHoveredNav,
  isAbsolute = false,
}: DockLayerProps) {
  const isLight = theme === 'light'
  return (
    <div
      ref={dockRef}
      onTouchStart={(e) => {
        const isBlocked = (
          showcaseState.isTransitioning ||
          showcaseState.portalPhase !== 'idle' ||
          (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
          showcaseState.scene5Phase !== 'idle' ||
          showcaseState.scene4Phase !== 'idle' ||
          (typeof showcaseState.canTriggerTransition === 'function' && !showcaseState.canTriggerTransition())
        )
        if (isBlocked) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onMouseLeave={(e) => {
        if (e.relatedTarget && typeof Node !== 'undefined' && e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
        const isMobile = typeof window !== 'undefined' && (
          window.innerWidth <= 880 ||
          ('ontouchstart' in window) ||
          (navigator.maxTouchPoints > 0) ||
          window.matchMedia('(hover: none), (pointer: coarse)').matches
        )
        if (isMobile) {
          setHoveredNav(null)
          return
        }
        const mousePos = showcaseState.lastMousePos || { x: e.clientX, y: e.clientY }
        if (
          showcaseState.isTransitioning ||
          showcaseState.portalPhase !== 'idle' ||
          (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
          showcaseState.scene5Phase !== 'idle'
        ) {
          const rect = e.currentTarget.getBoundingClientRect()
          if (mousePos.x >= rect.left && mousePos.x <= rect.right && mousePos.y >= rect.top && mousePos.y <= rect.bottom) return
        }
        const mobileDock = typeof document !== 'undefined' ? document.querySelector('.hud-mobile-dock') : null
        if (mobileDock) {
          const rect = mobileDock.getBoundingClientRect()
          if (mousePos.x >= rect.left - 2 && mousePos.x <= rect.right + 2 && mousePos.y >= rect.top - 2 && mousePos.y <= rect.bottom + 2) {
            return
          }
        }
        setHoveredNav(null)
      }}
      className={`${isAbsolute ? 'absolute inset-0' : 'relative'} flex items-center gap-1 p-1 backdrop-blur-md border text-[10px] font-mono tracking-widest uppercase pointer-events-auto ${
        isLight
          ? 'border-black/20 bg-white text-black'
          : 'border-white/20 bg-black text-white'
      }`}
    >
      <span className={isLight ? 'hud-crosshair-tl' : 'hud-crosshair-tl-white'} aria-hidden="true" />
      <span className={isLight ? 'hud-crosshair-tr' : 'hud-crosshair-tr-white'} aria-hidden="true" />
      <span className={isLight ? 'hud-crosshair-bl' : 'hud-crosshair-bl-white'} aria-hidden="true" />
      <span className={isLight ? 'hud-crosshair-br' : 'hud-crosshair-br-white'} aria-hidden="true" />

      {[
        { id: 1, fullLabel: '01/ OVERVIEW', shortLabel: '01/ OVR', aria: 'Navigate to section 01: Overview' },
        { id: 2, fullLabel: '02/ OLED DISPLAY', shortLabel: '02/ OLED', aria: 'Navigate to section 02: OLED Display' },
        { id: 3, fullLabel: '03/ LIBRARY', shortLabel: '03/ LIB', aria: 'Navigate to section 03: Steam Library' },
        { id: 5, fullLabel: '04/ PERFORMANCE', shortLabel: '04/ PERF', aria: 'Navigate to section 04: Hardware Performance & Specs' },
      ].map((tab) => {
        const isActive = tab.id === 3
          ? (activeTab === 3 || activeTab === 4)
          : (activeTab === tab.id)

        const activeClass = isLight
          ? (isActive ? 'text-black font-bold' : 'text-neutral-500 font-normal hover:text-black')
          : (isActive ? 'text-white font-bold' : 'text-white/40 font-normal hover:text-white')

        const isMobile = typeof window !== 'undefined' && (
          window.innerWidth <= 880 ||
          ('ontouchstart' in window) ||
          (navigator.maxTouchPoints > 0) ||
          window.matchMedia('(hover: none), (pointer: coarse)').matches
        )

        const isTabHovered = isMobile
          ? isActive
          : (hoveredNav === tab.id)

        return (
          <LinkHover
            key={tab.id}
            dataNavTab={tab.id}
            text={tab.fullLabel}
            shortText={tab.shortLabel}
            variant={isLight ? 'outline' : 'inverted'}
            isHovered={isTabHovered}
            onHoverChange={(h) => {
              const isBlocked = (
                showcaseState.isTransitioning ||
                showcaseState.portalPhase !== 'idle' ||
                (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
                showcaseState.scene5Phase !== 'idle' ||
                showcaseState.scene4Phase !== 'idle' ||
                (typeof showcaseState.canTriggerTransition === 'function' && !showcaseState.canTriggerTransition())
              )
              if (isBlocked) return

              const isMobileDevice = typeof window !== 'undefined' && (
                window.innerWidth <= 880 ||
                ('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0) ||
                window.matchMedia('(hover: none), (pointer: coarse)').matches
              )
              if (h) {
                if (isMobileDevice) return
                setHoveredNav(tab.id)
              } else {
                if (isMobileDevice) {
                  setHoveredNav((prev) => (prev === tab.id ? null : prev))
                  return
                }
                const mousePos = showcaseState.lastMousePos
                if (mousePos && isMouseOverNavTab(tab.id, mousePos)) return
                setHoveredNav((prev) => (prev === tab.id ? null : prev))
              }
            }}
            scrambleOnHover={true}
            onClick={() => {
              const isBlocked = (
                showcaseState.isTransitioning ||
                showcaseState.portalPhase !== 'idle' ||
                (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom') ||
                showcaseState.scene5Phase !== 'idle' ||
                showcaseState.scene4Phase !== 'idle' ||
                (typeof showcaseState.canTriggerTransition === 'function' && !showcaseState.canTriggerTransition())
              )
              if (isBlocked) return

              const isSameScene = tab.id === 3 ? (activeTab === 3 || activeTab === 4) : (activeTab === tab.id)
              if (isSameScene) return

              if (tab.id === 5) {
                showcaseState.triggerTransition(5, 'click')
              } else {
                showcaseState.triggerTransition(tab.id as 1 | 2 | 3)
              }
            }}
            aria-label={tab.aria}
            aria-current={isActive ? 'page' : undefined}
            className={`min-h-[30px] min-[400px]:min-h-[32px] sm:min-h-[34px] px-2 min-[380px]:px-2.5 sm:px-3 py-1 flex items-center justify-center font-mono text-[11px] min-[400px]:text-[11.5px] sm:text-[11px] tracking-wider uppercase transition-colors duration-[140ms] hover:duration-[100ms] ease-out rounded-[1px] select-none ${activeClass}`}
          />
        )
      })}
    </div>
  )
}
