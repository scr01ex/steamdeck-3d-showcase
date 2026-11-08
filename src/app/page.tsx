'use client'

import dynamic from 'next/dynamic'
import { GridPattern } from '@/components/ui/grid-pattern'

const Scene = dynamic(() => import('@/components/3d/Scene'), {
  ssr: false,
  loading: () => (
    <div 
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black select-none touch-none overscroll-none"
    >
      <div className="flex flex-col max-w-sm w-full px-6">
        <div className="flex items-baseline justify-between w-full font-mono mb-3">
          <span className="text-xs text-neutral-300 tracking-[0.22em] uppercase whitespace-nowrap">
            INITIALIZING 3D ENGINE…
          </span>
          <span className="text-[11px] text-neutral-400 tracking-[0.18em] tabular-nums">
            0%
          </span>
        </div>
        <div 
          role="progressbar"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="3D engine loading progress"
          className="w-full h-[1px] bg-neutral-800 relative overflow-hidden"
        >
          <div 
            className="h-full bg-white"
            style={{ width: '0%' }}
          />
        </div>
      </div>
    </div>
  ),
})

export default function Home() {
  return (
    <main className="relative w-full min-h-screen bg-white overflow-hidden select-none">
      {/* Background engineering grid with radial vignette */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <GridPattern
          width={40}
          height={40}
          x={-1}
          y={-1}
          strokeDasharray="4 2"
          className="stroke-neutral-900/[0.07]"
          squareClassName="fill-neutral-900/[0.02]"
          style={{
            maskImage: 'radial-gradient(1200px circle at center, black, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(1200px circle at center, black, transparent 80%)',
          }}
        />
      </div>

      {/* 3D Scene contains internal ScrollControls */}
      <div className="fixed inset-0 w-full h-screen h-[100dvh] z-10">
        <Scene />
      </div>
    </main>
  )
}

