import type { showcaseState } from '../components/3d/deckState'
import type { soundManager } from '../audio/soundEngine'
import type * as THREE from 'three'

declare global {
  interface Window {
    __showcaseState?: typeof showcaseState
    showcaseState?: typeof showcaseState
    deckState?: unknown
    soundManager?: typeof soundManager
    __soundManager?: typeof soundManager
    __camera?: THREE.Camera | unknown
    __scene?: THREE.Scene | unknown
    __scene3Camera?: THREE.Camera | unknown
    __scene3Renderer?: THREE.WebGLRenderer | unknown
    __scene3Scene?: THREE.Scene | unknown
    __deckGroup?: THREE.Group | unknown
    __deckWorldPos?: THREE.Vector3 | unknown
    __deckMesh?: THREE.Mesh | unknown
    __bladesRef?: unknown
    __planetMainGroup?: THREE.Group | unknown
    __sequenceProgressState?: unknown
    __planetPreloadState?: unknown
    __dreiScroll?: unknown
    THREE?: typeof THREE
  }
}

export {}
