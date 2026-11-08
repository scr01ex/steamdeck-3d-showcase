import * as THREE from 'three'

export interface SeamlessVideoController {
  texture: THREE.VideoTexture
  update: (isSceneVisible?: boolean) => void
  dispose: () => void
  readonly isReady: boolean
  activeVideo: HTMLVideoElement
  resume: () => void
  pause: () => void
  prepare: () => void
}

interface PlanetPreloadState {
  planetPosterLoaded: boolean
  ringPosterLoaded: boolean
  planetVideoReady: boolean
  ringVideoReady: boolean
  shadersCompiled: boolean
  videosPreloadStarted: boolean
  progress: number
  isReady: boolean
  subscribers: Set<() => void>
  notify: () => void
  subscribe: (cb: () => void) => () => void
  init: () => void
  startBackgroundVideoPreload: () => void
  markShadersCompiled: () => void
}

export const planetPreloadState: PlanetPreloadState = {
  planetPosterLoaded: false,
  ringPosterLoaded: false,
  planetVideoReady: false,
  ringVideoReady: false,
  shadersCompiled: false,
  videosPreloadStarted: false,
  progress: 0,
  isReady: false,
  subscribers: new Set<() => void>(),

  notify() {
    // Calculate total planet preload progress:
    // Posters (80% total = 40% + 40%)
    // Shaders (20%)
    let pct = 0
    if (this.planetPosterLoaded) pct += 40
    if (this.ringPosterLoaded) pct += 40
    if (this.shadersCompiled) pct += 20

    this.progress = Math.min(100, pct)
    // Ready once lightweight posters and shaders are initialized
    if (this.planetPosterLoaded && this.ringPosterLoaded) {
      this.isReady = true
    }
    this.subscribers.forEach((cb) => cb())
  },

  subscribe(cb: () => void) {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  },

  init() {
    if (typeof window === 'undefined') return
    // Only preload lightweight posters during initial boot (~200KB total)
    // Heavy 24MB video streams are deferred until model is ready
    initPlanetPosters()
  },

  startBackgroundVideoPreload() {
    if (typeof window === 'undefined') return
    if (this.videosPreloadStarted) return
    this.videosPreloadStarted = true
    const startStreams = () => {
      const planet = getPlanetVideoController()
      const ring = getRingVideoController()
      planet?.prepare()
      ring?.prepare()
    }
    if ('requestIdleCallback' in window && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(startStreams, { timeout: 2000 })
    } else {
      setTimeout(startStreams, 400)
    }
  },

  markShadersCompiled() {
    if (this.shadersCompiled) return
    this.shadersCompiled = true
    this.notify()
  },
}

if (typeof window !== 'undefined') {
  window.__planetPreloadState = planetPreloadState
}

// Cached poster textures
let cachedPlanetPoster: THREE.Texture | null = null
let cachedRingPoster: THREE.Texture | null = null

function initPlanetPosters(): void {
  if (typeof window === 'undefined') return

  if (!cachedPlanetPoster) {
    const loader = new THREE.TextureLoader()
    cachedPlanetPoster = loader.load(
      '/images/planet_mosaic_poster.jpg',
      () => {
        planetPreloadState.planetPosterLoaded = true
        planetPreloadState.notify()
      },
      undefined,
      () => {
        // Network fallback: mark ready to avoid blocking UI
        planetPreloadState.planetPosterLoaded = true
        planetPreloadState.notify()
      }
    )
    cachedPlanetPoster.colorSpace = THREE.SRGBColorSpace
    cachedPlanetPoster.wrapS = THREE.RepeatWrapping
    cachedPlanetPoster.wrapT = THREE.ClampToEdgeWrapping
    cachedPlanetPoster.generateMipmaps = false
    cachedPlanetPoster.minFilter = THREE.LinearFilter
    cachedPlanetPoster.magFilter = THREE.LinearFilter
  }

  if (!cachedRingPoster) {
    const loader = new THREE.TextureLoader()
    cachedRingPoster = loader.load(
      '/images/ring_mosaic_poster.jpg',
      () => {
        planetPreloadState.ringPosterLoaded = true
        planetPreloadState.notify()
      },
      undefined,
      () => {
        planetPreloadState.ringPosterLoaded = true
        planetPreloadState.notify()
      }
    )
    cachedRingPoster.colorSpace = THREE.SRGBColorSpace
    cachedRingPoster.wrapS = THREE.ClampToEdgeWrapping
    cachedRingPoster.wrapT = THREE.ClampToEdgeWrapping
    cachedRingPoster.generateMipmaps = false
    cachedRingPoster.minFilter = THREE.LinearFilter
    cachedRingPoster.magFilter = THREE.LinearFilter
  }
}

export function getPlanetPosterTexture(): THREE.Texture | null {
  if (!cachedPlanetPoster && typeof window !== 'undefined') {
    initPlanetPosters()
  }
  return cachedPlanetPoster
}

export function getRingPosterTexture(): THREE.Texture | null {
  if (!cachedRingPoster && typeof window !== 'undefined') {
    initPlanetPosters()
  }
  return cachedRingPoster
}

/**
 * Seamless video controller for Scene 3 (Planet & Orbit):
 * - Safe playback with promise tracking and per-frame watchdog to prevent freeze frames.
 * - Native loop=true fail-safe prevents stalls at video end.
 * - Dual-buffer ping-pong switching only when standby video is actively playing.
 * - GPU decoder bandwidth optimization: pauses playback in hidden scenes 1 and 2.
 * - Tab visibility recovery and gesture unlock handling.
 */
function createOptimizedSeamlessVideoController({
  src,
  duration,
  wrapS = THREE.ClampToEdgeWrapping,
  wrapT = THREE.ClampToEdgeWrapping,
  preRoll = 0.50,
  onReady,
}: {
  src: string
  duration: number
  wrapS?: THREE.Wrapping
  wrapT?: THREE.Wrapping
  preRoll?: number
  onReady?: () => void
}): SeamlessVideoController | null {
  if (typeof document === 'undefined') return null

  const createVideo = (id: string) => {
    const v = document.createElement('video')
    v.src = src
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.defaultMuted = true
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('webkit-playsinline', '')
    v.setAttribute('disablepictureinpicture', '')
    v.setAttribute('disableremoteplayback', '')
    v.disablePictureInPicture = true
    v.loop = true // Fail-safe native loop prevents stalling at video end
    v.playsInline = true
    v.preload = 'none'
    v.style.position = 'fixed'
    v.style.top = '0'
    v.style.left = '0'
    v.style.width = '1px'
    v.style.height = '1px'
    v.style.opacity = '0.0001'
    v.style.pointerEvents = 'none'
    v.style.zIndex = '-9999'
    v.setAttribute('data-seamless-video', id)
    if (document.body && !v.parentElement) {
      document.body.appendChild(v)
    }
    return v
  }

  const videoA = createVideo('A')
  const videoB = createVideo('B')

  let isVideoReady = false
  let lastUploadedTime = -1
  let hasUploadedInitialFrame = false
  let isSceneActive = false

  const notifyReady = () => {
    if (!isVideoReady && videoA.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      isVideoReady = true
      texture.needsUpdate = true
      hasUploadedInitialFrame = true
      onReady?.()
    }
  }

  const playPromises = new Map<HTMLVideoElement, Promise<void>>()

  const safePlay = async (v: HTMLVideoElement): Promise<void> => {
    if (!v) return
    if (!v.paused && !v.ended) return
    if (playPromises.has(v)) return

    try {
      const promise = v.play()
      if (promise !== undefined) {
        playPromises.set(v, promise)
        await promise
        notifyReady()
      }
    } catch (_err) {
      // Autoplay policy or abort - queue user gesture unlock
      const unlock = () => {
        if (!v.paused) return
        v.play().then(() => notifyReady()).catch(() => {})
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('wheel', unlock)
        window.removeEventListener('touchstart', unlock)
        window.removeEventListener('keydown', unlock)
      }
      window.addEventListener('pointerdown', unlock, { once: true, passive: true })
      window.addEventListener('wheel', unlock, { once: true, passive: true })
      window.addEventListener('touchstart', unlock, { once: true, passive: true })
      window.addEventListener('keydown', unlock, { once: true, passive: true })
    } finally {
      playPromises.delete(v)
    }
  }

  const safePause = (v: HTMLVideoElement): void => {
    if (!v) return
    const pending = playPromises.get(v)
    if (pending) {
      pending
        .then(() => {
          try {
            if (!v.paused) v.pause()
          } catch {}
        })
        .catch(() => {})
    } else {
      if (!v.paused) {
        try {
          v.pause()
        } catch {}
      }
    }
  }

  videoA.addEventListener('loadeddata', notifyReady)
  videoA.addEventListener('canplay', notifyReady)
  videoA.addEventListener('playing', notifyReady)
  videoA.addEventListener('timeupdate', notifyReady)

  videoB.addEventListener('loadeddata', notifyReady)
  videoB.addEventListener('canplay', notifyReady)
  videoB.addEventListener('playing', notifyReady)
  const texture = new THREE.VideoTexture(videoA)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = wrapS
  texture.wrapT = wrapT

  let activeVideo = videoA
  let standbyVideo = videoB
  let isStandbyRolling = false

  const prepare = () => {
    if (videoA.preload !== 'auto') videoA.preload = 'auto'
    if (videoB.preload !== 'auto') videoB.preload = 'auto'
    safePlay(videoA)
  }

  const resume = () => {
    isSceneActive = true
    prepare()
    const target = activeVideo || videoA
    if (target.paused || target.ended) {
      if (target.ended) {
        try {
          target.currentTime = 0
        } catch {}
      }
      safePlay(target)
    }
  }

  const pause = () => {
    isSceneActive = false
    safePause(activeVideo)
    safePause(standbyVideo)
    isStandbyRolling = false
  }

  const update = (isSceneVisible: boolean = true) => {
    const active = activeVideo
    const standby = standbyVideo
    if (!active) return

    // Decoder bandwidth optimization:
    // Warm up single initial frame when scene is not visible (scenes 1-2),
    // then pause playback to prevent hardware decoder saturation and background loop burn-out.
    if (!isSceneVisible) {
      if (!hasUploadedInitialFrame && active.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        texture.needsUpdate = true
        hasUploadedInitialFrame = true
        if (!isVideoReady) {
          isVideoReady = true
          onReady?.()
        }
      }
      if (hasUploadedInitialFrame && (!active.paused || !standby.paused)) {
        safePause(active)
        safePause(standby)
        isStandbyRolling = false
      }
      return
    }

    // Visible scene watchdog:
    // Resume playback if visible video paused unexpectedly or reached the end.
    if (active.paused || active.ended) {
      if (active.ended) {
        try {
          active.currentTime = 0
        } catch {}
      }
      safePlay(active)
    }

    // Texture upload throttling:
    // Upload texture to GPU only when currentTime changes (new decoded frame available).
    if (!active.seeking && active.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const curTime = active.currentTime
      if (curTime !== lastUploadedTime) {
        lastUploadedTime = curTime
        texture.needsUpdate = true
      }
      if (!isVideoReady) {
        isVideoReady = true
        onReady?.()
      }
    }

    const cur = active.currentTime
    const total =
      active.duration && !isNaN(active.duration) && isFinite(active.duration) && active.duration > 0
        ? active.duration
        : duration

    // Pre-roll standby video before loop seam
    if (total > 0 && cur >= total - preRoll && !isStandbyRolling) {
      isStandbyRolling = true
      if (standby.preload !== 'auto') standby.preload = 'auto'
      standby.currentTime = 0
      safePlay(standby)
    }

    // Seamless handover without WebGL re-allocation:
    const isAtSeam = cur >= total - 0.065 || active.ended
    const isStandbyReady =
      standby.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      !standby.paused &&
      !standby.seeking &&
      standby.currentTime > 0

    if (isAtSeam) {
      if (isStandbyReady) {
        // Standby ready and playing: swap texture source
        texture.image = standby
        texture.needsUpdate = true
        lastUploadedTime = standby.currentTime

        safePause(active)
        try {
          active.currentTime = 0
        } catch {}

        activeVideo = standby
        standbyVideo = active
        isStandbyRolling = false
      } else {
        // Standby not ready: fallback to native loop on active video
        if (active.ended || cur >= total - 0.04) {
          try {
            active.currentTime = 0
          } catch {}
          safePlay(active)
          isStandbyRolling = false
        }
      }
    }
  }

  const dispose = () => {
    videoA.removeEventListener('loadeddata', notifyReady)
    videoA.removeEventListener('canplay', notifyReady)
    videoA.removeEventListener('playing', notifyReady)
    videoA.removeEventListener('timeupdate', notifyReady)
    videoB.removeEventListener('loadeddata', notifyReady)
    videoB.removeEventListener('canplay', notifyReady)
    videoB.removeEventListener('playing', notifyReady)
    videoB.removeEventListener('timeupdate', notifyReady)
    safePause(videoA)
    safePause(videoB)
    if (videoA.parentNode) videoA.parentNode.removeChild(videoA)
    if (videoB.parentNode) videoB.parentNode.removeChild(videoB)
    texture.dispose()
  }

  return {
    texture,
    update,
    dispose,
    resume,
    pause,
    prepare,
    get isReady() {
      return isVideoReady
    },
    get activeVideo() {
      return activeVideo
    },
  }
}

// Singleton video controllers reused across preloader and scene
let globalPlanetLooper: SeamlessVideoController | null = null
let globalRingLooper: SeamlessVideoController | null = null

export function getPlanetVideoController(): SeamlessVideoController | null {
  if (typeof window === 'undefined') return null
  if (!globalPlanetLooper) {
    globalPlanetLooper = createOptimizedSeamlessVideoController({
      src: '/videos/planet_120_games_mosaic.mp4?v=20260921_seamless_v1',
      duration: 20.0,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      preRoll: 0.45,
      onReady: () => {
        planetPreloadState.planetVideoReady = true
        planetPreloadState.notify()
      },
    })
  }
  return globalPlanetLooper
}

export function getRingVideoController(): SeamlessVideoController | null {
  if (typeof window === 'undefined') return null
  if (!globalRingLooper) {
    globalRingLooper = createOptimizedSeamlessVideoController({
      src: '/videos/ring_16_games_mosaic.mp4?v=20260921_seamless_v1',
      duration: 48.0,
      preRoll: 0.50,
      onReady: () => {
        planetPreloadState.ringVideoReady = true
        planetPreloadState.notify()
      },
    })
  }
  return globalRingLooper
}
