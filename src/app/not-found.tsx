'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { soundManager } from '@/audio/soundEngine'

export default function NotFound() {
  const router = useRouter()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ' || e.key === '1') {
        e.preventDefault()
        try {
          soundManager.playButtonClick()
        } catch (_) {}
        router.push('/')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  const handleReturn = () => {
    try {
      soundManager.playButtonClick()
    } catch (_) {}
    router.push('/')
  }

  return (
    <main 
      role="status"
      aria-live="polite"
      onClick={handleReturn}
      className="fixed inset-0 z-50 flex items-center h-screen h-[100dvh] w-screen bg-white text-black select-none touch-none overscroll-none overflow-hidden cursor-pointer"
    >
      <div 
        className="flex flex-col justify-between h-full pl-1 sm:pl-0 select-none font-sans font-black text-[min(44.2vh,44.2dvh)] leading-[0.69] tracking-[-0.06em] shrink-0"
        aria-hidden="true"
      >
        <span className="block text-black -mt-[0.012em]">4</span>
        
        {/* Steam Deck OLED emblem integrated into numeric 404 glyph */}
        <div className="flex items-center h-[0.878em] leading-none shrink-0 overflow-visible -translate-y-[0.016em] ml-[0.01em]">
          <svg 
            viewBox="0 0 37.0385 49.3856" 
            aria-hidden="true"
            className="h-full w-auto overflow-visible pointer-events-none block"
          >
            <circle cx="12.3464" cy="24.7191" r="12.3464" fill="#FF5A36" />
            <path 
              fillRule="evenodd" 
              clipRule="evenodd" 
              d="M28.1744 24.6928C28.1744 15.9508 21.0877 8.86409 12.3457 8.86409V0C25.9832 0 37.0385 11.0553 37.0385 24.6928C37.0385 38.3303 25.9832 49.3856 12.3457 49.3856V40.5215C21.0877 40.5215 28.1744 33.4348 28.1744 24.6928Z" 
              fill="#000000"
            />
          </svg>
        </div>

        <span className="block text-black -mb-[0.016em]">4</span>
      </div>

      <div className="ml-[clamp(10px,3.5vw,64px)] flex-1 flex flex-col justify-center overflow-hidden pr-3 sm:pr-8">
        <h1 className="font-sans font-black uppercase tracking-tight leading-[0.80] text-[clamp(24px,8vw,38px)] sm:text-[clamp(32px,13.5vw,210px)]">
          <span className="block text-black">NOT</span>
          <span className="block text-black">FOUND</span>
        </h1>
      </div>
    </main>
  )
}
