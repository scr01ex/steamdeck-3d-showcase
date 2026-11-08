'use client'

import { useEffect } from 'react'

export function useResponsiveCardMargins() {
  useEffect(() => {
    const updateMargins = () => {
      if (typeof window === 'undefined') return
      const W = window.innerWidth
      const H = window.innerHeight
      const aspect = W / H
      const isStacked = (W <= 1024) || (aspect <= 1.15)

      if (isStacked) {
        document.documentElement.style.removeProperty('--card-hero-left')
        document.documentElement.style.removeProperty('--card-library-right')
        return
      }

      const cardW = W >= 1024 ? 420 : 380
      const dBase = W >= 1024 ? 64 : 56
      const dMin = 44

      // 1. Scene 3 (Library / Planet & Ring):
      // Right edge of the ring in screen pixels at X = -3.71 accounting for physical screen width:
      // X_ring_right = W/2 + 0.2145 * H (R=4.2 * 0.94 + screen extent 0.725 ~ 4.673; relative to lookAt -0.85 gives +1.813 / 8.45)
      const sMargin3 = W * 0.5 - 0.2145 * H - cardW
      let dEdge3 = dBase
      if (sMargin3 < 2 * dBase) {
        dEdge3 = Math.max(dMin, Math.round(sMargin3 / 2))
      }

      // 2. Scene 1 (Hero / Steam Deck):
      // Left grip of the console in screen pixels at base position X = 1.475:
      // X_deck_left = W/2 - 0.1435 * H
      // Symmetrical margin clearance around text card (left border to text + right margin to console):
      const sMargin1 = W * 0.5 - 0.1435 * H - cardW
      let dEdge1 = dBase
      if (sMargin1 < 2 * dBase) {
        dEdge1 = Math.max(dMin, Math.round(sMargin1 / 2))
      }

      document.documentElement.style.setProperty('--card-library-right', `${dEdge3}px`)
      document.documentElement.style.setProperty('--card-hero-left', `${dEdge1}px`)
    }

    updateMargins()
    window.addEventListener('resize', updateMargins, { passive: true })
    return () => {
      window.removeEventListener('resize', updateMargins)
    }
  }, [])
}
