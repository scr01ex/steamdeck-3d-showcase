'use client'

import { Suspense, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, ScrollControls, useScroll } from '@react-three/drei'
import * as THREE from 'three'
import { SteamDeck } from './SteamDeck'
import { Overlay } from '../ui/Overlay'
import { LoadingScreen } from '../ui/LoadingScreen'
import { showcaseState } from './deckState'
import { SHOWCASE_GAMES } from '../ui/GameShowcaseReel'

if (typeof window !== 'undefined') {
  const originalWarn = console.warn
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Clock: This module has been deprecated')) return
    originalWarn(...args)
  }
}

function CameraChoreography() {
  const currentPos = useRef(new THREE.Vector3(0, 0, 9))
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0))

  useFrame(({ camera }, delta) => {
    const offset = showcaseState.isReady ? showcaseState.offset : 0

    // In Scenes 1 and 2, camera remains centered on console: [0, 0, 9] -> [0, 0, 0]
    currentPos.current.x = THREE.MathUtils.damp(currentPos.current.x, 0, 6.0, delta)
    currentPos.current.y = THREE.MathUtils.damp(currentPos.current.y, 0, 6.0, delta)
    currentPos.current.z = THREE.MathUtils.damp(currentPos.current.z, 9, 6.0, delta)
    currentLookAt.current.x = THREE.MathUtils.damp(currentLookAt.current.x, 0, 6.0, delta)
    currentLookAt.current.y = THREE.MathUtils.damp(currentLookAt.current.y, 0, 6.0, delta)

    camera.position.set(currentPos.current.x, currentPos.current.y, currentPos.current.z)
    camera.lookAt(currentLookAt.current.x, currentLookAt.current.y, currentLookAt.current.z)
  })

  return null
}

interface ScrollSyncProps {
  backdropRef: React.RefObject<HTMLDivElement | null>
  auraRef: React.RefObject<HTMLDivElement | null>
}

function ScrollSync({ backdropRef, auraRef }: ScrollSyncProps) {
  const scroll = useScroll()
  const lastAuraOpacity = useRef<string>('')
  const lastBackdropVisibility = useRef<string>('')
  const lastBackdropOpacity = useRef<string>('')

  if (typeof window !== 'undefined') {
    window.__dreiScroll = scroll
  }
  useFrame(() => {
    if (scroll) {
      if (scroll.el && showcaseState.scrollEl !== scroll.el) {
        showcaseState.scrollEl = scroll.el
      }

      // Prevent scroll input while preloader is active
      if (!showcaseState.isReady) {
        if (scroll.el && scroll.el.scrollTop !== 0) {
          scroll.el.scrollTop = 0
        }
        showcaseState.offset = 0
        return
      }

      if (showcaseState.portalPhase !== 'idle') {
        const isEnteringScene1 = showcaseState.portalPhase === 'closing' && showcaseState.portalTargetScene === 1
        const isLeavingScene1 = showcaseState.portalPhase === 'opening' && showcaseState.portalSourceScene === 1
        if (isEnteringScene1) {
          showcaseState.offset = 0.28
        } else if (isLeavingScene1) {
          // Retain user scroll offset when leaving Scene 1 to preserve exact console orientation
        } else if (showcaseState.portalTargetScene === 2 || showcaseState.portalSourceScene === 2) {
          showcaseState.offset = 0.65
        }
      } else if (showcaseState.activeScene === 3) {
        showcaseState.offset = 0.90
      } else if (showcaseState.activeScene === 4 || showcaseState.activeScene === 5) {
        showcaseState.offset = 1.00
      } else if (showcaseState.activeScene === 1) {
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 880
        const rawOffset = typeof scroll.offset === 'number' && !isNaN(scroll.offset) ? scroll.offset : 0
        if (isMobile && !showcaseState.isScene1TextComplete) {
          if (rawOffset > 0.28) {
            showcaseState.offset = 0.28
            if (scroll.el) {
              const maxScroll = scroll.el.scrollHeight - scroll.el.clientHeight
              scroll.el.scrollTop = maxScroll * 0.28
            }
          } else {
            showcaseState.offset = rawOffset
          }
        } else if (showcaseState.offset > 0.35) {
          showcaseState.offset = 0.28
        } else {
          showcaseState.offset = rawOffset
        }
      } else {
        const rawOffset = typeof scroll.offset === 'number' && !isNaN(scroll.offset) ? scroll.offset : 0
        showcaseState.offset = rawOffset
      }

      if (typeof window !== 'undefined') {
        window.__showcaseState = showcaseState
      }

      // Synchronize darkroom backdrop state across scenes:
      const backdrop = backdropRef.current || (typeof document !== 'undefined' ? document.getElementById('darkroom-backdrop') : null)
      if (backdrop) {
        const isDirectScene1To5Portal = showcaseState.portalPhase !== 'idle' && (
          (showcaseState.portalSourceScene === 1 && showcaseState.portalTargetScene === 5) ||
          (showcaseState.portalSourceScene === 5 && showcaseState.portalTargetScene === 1)
        )
        const isScene2Active = showcaseState.activeScene === 2 || showcaseState.darkroomMode
        const isScene2Transition = showcaseState.portalPhase !== 'idle' && (showcaseState.portalSourceScene === 2 || showcaseState.portalTargetScene === 2)
        const isScene2Involved = isScene2Active || isScene2Transition
        const isScene5Involved = (showcaseState.activeScene === 5 || showcaseState.scene5Progress > 0.001) && !isDirectScene1To5Portal

        const aura = auraRef.current || (typeof document !== 'undefined' ? document.getElementById('darkroom-aura') : null)
        if (aura) {
          const targetAuraOpacity = isScene2Involved ? '1' : '0'
          if (lastAuraOpacity.current !== targetAuraOpacity) {
            aura.style.opacity = targetAuraOpacity
            lastAuraOpacity.current = targetAuraOpacity
          }
        }

        let targetVisibility = 'hidden'
        let targetOpacity = '0'

        if (isScene2Involved) {
          targetVisibility = 'visible'
          targetOpacity = '1'
        } else if (isScene5Involved) {
          targetVisibility = 'visible'
          targetOpacity = showcaseState.scene5Progress.toFixed(3)
        }

        if (lastBackdropVisibility.current !== targetVisibility) {
          backdrop.style.visibility = targetVisibility
          lastBackdropVisibility.current = targetVisibility
        }
        if (lastBackdropOpacity.current !== targetOpacity) {
          backdrop.style.opacity = targetOpacity
          lastBackdropOpacity.current = targetOpacity
        }
      }
    }
  })
  return null
}

function DynamicSceneLighting() {
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const mainDirRef = useRef<THREE.DirectionalLight>(null)
  const heroKeyRef = useRef<THREE.DirectionalLight>(null)
  const fillLeftRef = useRef<THREE.DirectionalLight>(null)
  const fillRightRef = useRef<THREE.DirectionalLight>(null)
  const bottomRef = useRef<THREE.DirectionalLight>(null)
  const rimRef = useRef<THREE.DirectionalLight>(null)

  useFrame((_, delta) => {
    const isScene2Active = showcaseState.activeScene === 2
    const isScene2Transition = showcaseState.portalPhase !== 'idle' && (showcaseState.portalSourceScene === 2 || showcaseState.portalTargetScene === 2)
    const isDarkroom = isScene2Active || isScene2Transition
    const dp = isDarkroom ? 1.0 : 0

    if (dp <= 0.001) {
      if (hemiRef.current) hemiRef.current.intensity = 2.1
      if (ambientRef.current) ambientRef.current.intensity = 1.55
      if (mainDirRef.current) mainDirRef.current.intensity = 1.75
      if (heroKeyRef.current) heroKeyRef.current.intensity = 1.15
      if (fillLeftRef.current) fillLeftRef.current.intensity = 1.5
      if (fillRightRef.current) fillRightRef.current.intensity = 1.45
      if (bottomRef.current) bottomRef.current.intensity = 1.45
      if (rimRef.current) rimRef.current.intensity = 1.7
    } else {
      if (hemiRef.current) {
        const target = THREE.MathUtils.lerp(2.1, 0.12, dp)
        hemiRef.current.intensity = THREE.MathUtils.damp(hemiRef.current.intensity, target, 8, delta)
      }
      if (ambientRef.current) {
        const target = THREE.MathUtils.lerp(1.55, 0.12, dp)
        ambientRef.current.intensity = THREE.MathUtils.damp(ambientRef.current.intensity, target, 8, delta)
      }
      if (mainDirRef.current) {
        const target = THREE.MathUtils.lerp(1.75, 0.14, dp)
        mainDirRef.current.intensity = THREE.MathUtils.damp(mainDirRef.current.intensity, target, 8, delta)
      }
      if (heroKeyRef.current) {
        const target = THREE.MathUtils.lerp(1.15, 0.08, dp)
        heroKeyRef.current.intensity = THREE.MathUtils.damp(heroKeyRef.current.intensity, target, 8, delta)
      }
      if (fillLeftRef.current) {
        const target = THREE.MathUtils.lerp(1.5, 0.08, dp)
        fillLeftRef.current.intensity = THREE.MathUtils.damp(fillLeftRef.current.intensity, target, 8, delta)
      }
      if (fillRightRef.current) {
        const target = THREE.MathUtils.lerp(1.45, 0.08, dp)
        fillRightRef.current.intensity = THREE.MathUtils.damp(fillRightRef.current.intensity, target, 8, delta)
      }
      if (bottomRef.current) {
        const target = THREE.MathUtils.lerp(1.45, 0.06, dp)
        bottomRef.current.intensity = THREE.MathUtils.damp(bottomRef.current.intensity, target, 8, delta)
      }
      if (rimRef.current) {
        const target = THREE.MathUtils.lerp(1.7, 0.65, dp)
        rimRef.current.intensity = THREE.MathUtils.damp(rimRef.current.intensity, target, 8, delta)
      }
    }
  })

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#ffffff', '#cbd5e1', 2.1]} />
      <ambientLight ref={ambientRef} intensity={1.55} />
      <directionalLight 
        ref={mainDirRef}
        position={[3, 8, 10]} 
        intensity={1.75} 
      />
      <directionalLight 
        ref={heroKeyRef}
        position={[1.5, 2.5, 11]} 
        intensity={1.15} 
        color="#ffffff"
      />
      <directionalLight 
        ref={fillLeftRef}
        position={[-7, 2, 10]} 
        intensity={1.5} 
        color="#f8fafc"
      />
      <directionalLight 
        ref={fillRightRef}
        position={[7, 2, 10]} 
        intensity={1.45} 
        color="#f8fafc"
      />
      <directionalLight 
        ref={bottomRef}
        position={[0, -4, 10]} 
        intensity={1.45} 
        color="#f1f5f9"
      />
      <directionalLight 
        ref={rimRef}
        position={[0, 7, -5]} 
        intensity={1.7} 
        color="#e2e8f0" 
      />
    </>
  )
}

function AdaptiveContactShadows() {
  const { size, camera } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  const aspect = cam.aspect || (size.width / size.height) || 1.777
  // Stacked layout: width <= 1024px or aspect <= 1.15.
  // In this resolution the console shifts downward; hide contact shadow to avoid clipping artifact.
  // On desktop viewports, contact shadow remains fully active.
  const isStacked = (size.width <= 1024) || (aspect <= 1.15)

  return (
    <ContactShadows 
      position={[0, -2.8, 0]} 
      opacity={isStacked ? 0 : 0.35} 
      visible={!isStacked}
      scale={22} 
      blur={2.6} 
      far={8} 
      resolution={512} 
      color="#334155" 
    />
  )
}

export default function Scene() {
  const backdropRef = useRef<HTMLDivElement>(null)
  const auraRef = useRef<HTMLDivElement>(null)
  const [accentColor, setAccentColor] = useState(
    SHOWCASE_GAMES[showcaseState.activeGameIndex]?.accentColor || '#F43F5E'
  )

  useEffect(() => {
    return showcaseState.onGameChange((idx) => {
      const g = SHOWCASE_GAMES[idx]
      if (g) setAccentColor(g.accentColor)
    })
  }, [])

  return (
    <div className="w-full h-full absolute inset-0">
      {/* OLED Darkroom pitch-black backdrop with reactive color aura */}
      <div 
        ref={backdropRef}
        id="darkroom-backdrop"
        className="fixed inset-0 bg-[#000000] pointer-events-none z-10 will-change-opacity overflow-hidden"
        style={{ opacity: 0 }}
      >
        <div 
          ref={auraRef}
          id="darkroom-aura"
          className="absolute inset-0 transition-opacity duration-700 ease-out pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 1100px 650px at 50% 50%, ${accentColor}55 0%, ${accentColor}25 45%, ${accentColor}08 70%, transparent 85%)`,
            opacity: 0,
          }}
        />
      </div>
      <div className="w-full h-full relative z-20 pointer-events-none">
        <Canvas 
          role="img"
          aria-label="Interactive 3D model of Steam Deck OLED"
          camera={{ position: [0, 0, 9], fov: 45 }}
          dpr={[1.25, 2]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ scene, camera, gl }) => {
            window.__scene = scene;
            window.__camera = camera;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.0;
            if (gl.domElement) {
              gl.domElement.setAttribute('role', 'img');
              gl.domElement.setAttribute('aria-label', 'Interactive 3D model of Steam Deck OLED');
            }
          }}
        >
          <Suspense fallback={null}>
            <ScrollControls pages={7} damping={0.30}>
              <ScrollSync backdropRef={backdropRef} auraRef={auraRef} />
              <CameraChoreography />
              <SteamDeck position={[0, 0, 0]} />
            </ScrollControls>
            
            <DynamicSceneLighting />
            <AdaptiveContactShadows />
          </Suspense>
        </Canvas>
      </div>
      <Overlay />
      <LoadingScreen />
    </div>
  )
}
