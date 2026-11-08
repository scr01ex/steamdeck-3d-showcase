'use client'

import { useState, useEffect } from 'react'
import { soundManager, AudioEngineState, type PlanetWindSpatialOptions, type HackyTickOptions } from './soundEngine'

export function useSound() {
  const [state, setState] = useState<AudioEngineState>(() => soundManager.getState())

  useEffect(() => {
    return soundManager.subscribe(setState)
  }, [])

  return {
    isMuted: state.isMuted,
    isInitialized: state.isInitialized,
    isAmbientPlaying: state.isAmbientPlaying,
    volume: state.volume,
    toggleMute: () => soundManager.toggleMute(),
    setMuted: (muted: boolean) => soundManager.setMuted(muted),
    playBootChime: () => soundManager.playBootChime(),
    playHaptic: (intensity?: number, pan?: number) => soundManager.playHaptic(intensity, pan),
    playHover: (pan?: number) => soundManager.playHover(pan),
    playButtonClick: (pan?: number) => soundManager.playButtonClick(pan),
    playClick: (pan?: number) => soundManager.playClick(pan),
    playShutterCut: (action?: 'close' | 'open' | 'closing' | 'slide') => soundManager.playShutterCut(action),
    playPortalWarp: () => soundManager.playPortalWarp(),
    playPortalUnlatch: () => soundManager.playPortalUnlatch(),
    playPortalSeal: () => soundManager.playPortalSeal(),
    updatePortalMotion: (
      phase: 'idle' | 'opening' | 'closing',
      progress?: number,
      sourceScene?: number,
      targetScene?: number
    ) => soundManager.updatePortalMotion(phase, progress, sourceScene, targetScene),
    playScene5Portal: (phase?: 'opening' | 'closing' | 'open' | 'close') => soundManager.playScene5Portal(phase),
    playCrystalTransition: (direction?: 'forward' | 'reverse') => soundManager.playCrystalTransition(direction),
    updateCrystalMotion: (
      phase: 'idle' | 'transitioning',
      progress?: number,
      direction?: 'forward' | 'reverse'
    ) => soundManager.updateCrystalMotion(phase, progress, direction),
    playPlanetWindWhoosh: (direction?: 'forward' | 'reverse') => soundManager.playPlanetWindWhoosh(direction),
    updatePlanetWind: (
      velocity: number,
      portalPhase?: string,
      portalProgress?: number,
      spatial?: PlanetWindSpatialOptions
    ) => soundManager.updatePlanetWind(velocity, portalPhase, portalProgress, spatial),
    playGameSwitch: (direction?: 1 | -1) => soundManager.playGameSwitch(direction),
    playGameSelect: () => soundManager.playGameSelect(),
    playHackyTick: (char?: string, options?: HackyTickOptions) =>
      soundManager.playHackyTick(char, options),
    playSpecTab: () => soundManager.playSpecTab(),
    playCartAdd: () => soundManager.playCartAdd(),
    startAmbient: () => soundManager.startAmbient(),
    stopAmbient: () => soundManager.stopAmbient(),
    updateAmbient: (scene: number, scrollVelocity?: number, sceneProgress?: number, shutterPhase?: string) =>
      soundManager.updateAmbient(scene, scrollVelocity, sceneProgress, shutterPhase),
  }
}
