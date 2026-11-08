'use client'

import React from 'react'
import { SoundToggle } from './SoundToggle'
import { LinkHover } from './LinkHover'
import { showcaseState } from '../3d/deckState'
import { isMouseOverNavTab } from './navigationUtils'

export interface HeaderBarProps {
  id?: string
  headerRef: React.RefObject<HTMLElement | null>
  theme: 'light' | 'dark'
  activeTab: number
  isSoundHovered: boolean
  setIsSoundHovered: (v: boolean) => void
  hoveredNav: number | null
  setHoveredNav: React.Dispatch<React.SetStateAction<number | null>>
  isCartHovered: boolean
  setIsCartHovered: (v: boolean) => void
  onCartClick?: () => void
  navOverviewRef?: React.RefObject<HTMLButtonElement | null>
}

export function HeaderBar({
  id,
  headerRef,
  theme,
  activeTab,
  isSoundHovered,
  setIsSoundHovered,
  hoveredNav,
  setHoveredNav,
  isCartHovered,
  setIsCartHovered,
  onCartClick,
  navOverviewRef,
}: HeaderBarProps) {
  const isLight = theme === 'light'
  return (
    <header
      id={id}
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 md:px-8 xl:px-12 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))] pointer-events-none ${
        isLight ? 'z-50' : 'z-[45]'
      }`}
    >
      {/* Left Side: Sound Control HUD Toggle with LinkHover Stencil Sweep */}
      <SoundToggle
        variant={theme}
        isHovered={isSoundHovered}
        onHoverChange={setIsSoundHovered}
        className="w-auto min-w-[104px] sm:min-w-[112px] xl:w-[154px] h-[36px] sm:h-[40px] flex-shrink-0"
      />

      {/* Center Swiss Navigation Link with LinkHover Through-Sweep - Monolithic Dimensions */}
      <nav 
        onMouseLeave={(e) => {
          if (e.relatedTarget && typeof Node !== 'undefined' && e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
          const mousePos = showcaseState.lastMousePos || { x: e.clientX, y: e.clientY }
          if (mousePos) {
            for (const tid of [1, 2, 3, 5]) {
              if (isMouseOverNavTab(tid, mousePos, true)) {
                return
              }
            }
          }
          setHoveredNav(null)
        }}
        aria-label={`${isLight ? 'Overview Scene' : 'Darkroom Scene'} Navigation`}
        className={`hud-desktop-nav items-center gap-1 backdrop-blur-md p-1 border text-xs font-mono tracking-widest uppercase shadow-none pointer-events-auto absolute left-1/2 -translate-x-1/2 w-[580px] h-[38px] box-border ${
          isLight
            ? 'bg-white border-black/20 text-black'
            : 'bg-black border-white/20 text-white'
        }`}
      >
        <span className={isLight ? 'hud-crosshair-tl' : 'hud-crosshair-tl-white'} aria-hidden="true" />
        <span className={isLight ? 'hud-crosshair-tr' : 'hud-crosshair-tr-white'} aria-hidden="true" />
        <span className={isLight ? 'hud-crosshair-bl' : 'hud-crosshair-bl-white'} aria-hidden="true" />
        <span className={isLight ? 'hud-crosshair-br' : 'hud-crosshair-br-white'} aria-hidden="true" />

        {[
          { id: 1, label: '01/ OVERVIEW', w: 'w-[124px]', aria: 'Navigate to section 01: Overview' },
          { id: 2, label: '02/ OLED DISPLAY', w: 'w-[156px]', aria: 'Navigate to section 02: OLED Display' },
          { id: 3, label: '03/ LIBRARY', w: 'w-[124px]', aria: 'Navigate to section 03: Steam Library' },
          { id: 5, label: '04/ PERFORMANCE', w: 'w-[156px]', aria: 'Navigate to section 04: Hardware Performance & Specs' },
        ].map((item) => {
          const isActive = item.id === 3
            ? (activeTab === 3 || activeTab === 4)
            : (activeTab === item.id)

          const activeClass = isLight
            ? (isActive ? 'text-black font-bold' : 'text-neutral-500 font-normal hover:text-black')
            : (isActive ? 'text-white font-bold' : 'text-white/40 hover:text-white font-normal')

          return (
            <LinkHover
              key={item.id}
              dataNavTab={item.id}
              buttonRef={item.id === 1 ? navOverviewRef : undefined}
              variant={isLight ? 'outline' : 'inverted'}
              isHovered={hoveredNav === item.id}
              onHoverChange={(h) => {
                const isMobile = typeof window !== 'undefined' && (
                  window.innerWidth <= 880 ||
                  ('ontouchstart' in window) ||
                  (navigator.maxTouchPoints > 0) ||
                  window.matchMedia('(hover: none), (pointer: coarse)').matches
                )
                if (isMobile) return
                if (h) {
                  setHoveredNav(item.id)
                } else {
                  const mousePos = showcaseState.lastMousePos
                  if (mousePos && isMouseOverNavTab(item.id, mousePos, true)) {
                    return
                  }
                  setHoveredNav((prev) => (prev === item.id ? null : prev))
                }
              }}
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

                const isSameScene = item.id === 3 ? (activeTab === 3 || activeTab === 4) : (activeTab === item.id)
                if (isSameScene) return

                if (item.id === 5) {
                  showcaseState.triggerTransition(5, 'click')
                } else {
                  showcaseState.triggerTransition(item.id as 1 | 2 | 3)
                }
              }}
              aria-label={item.aria}
              className={`${item.w} h-[30px] flex-shrink-0 transition-colors duration-[140ms] hover:duration-[100ms] ease-out ${activeClass}`}
            >
              {item.label}
            </LinkHover>
          )
        })}
      </nav>

      {/* Top-Right Action Button */}
      <div 
        onMouseLeave={(e) => {
          if (e.relatedTarget && typeof Node !== 'undefined' && e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
          if (
            showcaseState.isTransitioning ||
            showcaseState.portalPhase !== 'idle' ||
            (showcaseState.shutterPhase !== 'idle' && showcaseState.shutterPhase !== 'darkroom')
          ) {
            const rect = e.currentTarget.getBoundingClientRect()
            const isStillInside = (
              e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom
            )
            if (isStillInside) return
          }
          setIsCartHovered(false)
        }}
        className="ml-auto pointer-events-auto relative p-[3px] w-auto xl:w-[234px] h-[36px] sm:h-[40px] flex items-center justify-center box-border"
      >
        <span className={isLight ? 'hud-crosshair-tl' : 'hud-crosshair-tl-white'} aria-hidden="true" />
        <span className={isLight ? 'hud-crosshair-tr' : 'hud-crosshair-tr-white'} aria-hidden="true" />
        <span className={isLight ? 'hud-crosshair-bl' : 'hud-crosshair-bl-white'} aria-hidden="true" />
        <span className={isLight ? 'hud-crosshair-br' : 'hud-crosshair-br-white'} aria-hidden="true" />
        <div className="hidden xl:block">
          <LinkHover
            variant={isLight ? 'solid' : 'outline'}
            isHovered={isCartHovered}
            onHoverChange={setIsCartHovered}
            onClick={onCartClick}
            href="https://store.steampowered.com/steamdeck"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buy Steam Deck OLED on official Steam Store (opens in new tab)"
            text="[ADD TO CART // $789]"
            className={`w-[228px] h-[34px] flex-shrink-0 font-mono text-xs font-bold tracking-wider uppercase shadow-none hover:shadow-none ${
              isLight
                ? 'bg-black text-white border border-black'
                : 'bg-white text-black border border-white'
            }`}
          />
        </div>
        <div className="block xl:hidden">
          <LinkHover
            variant={isLight ? 'solid' : 'outline'}
            isHovered={isCartHovered}
            onHoverChange={setIsCartHovered}
            onClick={onCartClick}
            href="https://store.steampowered.com/steamdeck"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buy Steam Deck OLED on official Steam Store (opens in new tab)"
            text="[$789]"
            className={`px-3 h-[30px] flex-shrink-0 font-mono text-[11px] font-bold tracking-wider uppercase shadow-none hover:shadow-none ${
              isLight
                ? 'bg-black text-white border border-black'
                : 'bg-white text-black border border-white'
            }`}
          />
        </div>
      </div>
    </header>
  )
}
