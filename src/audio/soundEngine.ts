'use client'

import { trackEvent } from '../lib/analytics'

/**
 * Steam Deck 3D Showcase - Procedural Web Audio Engine
 * Real-time synthesis for UI gestures, haptic feedback, 3D cooling fan acoustics,
 * and spatial audio panning.
 */

export interface AudioEngineState {
  isMuted: boolean
  isInitialized: boolean
  volume: number
  isAmbientPlaying: boolean
}

export interface HackyTickOptions {
  index?: number
  total?: number
  isReverse?: boolean
  intensity?: number
  delaySec?: number
}

export interface PlanetWindSpatialOptions {
  /** Screen horizontal coordinate in Normalized Device Coordinates [-1.0 .. 1.0] (0 = center, -0.34 = left) */
  screenX?: number
  /** Proximity / camera closeness factor [0.0 .. 1.0] (0 = normal distance, 1 = up close in orbit) */
  proximity?: number
  /** Whether Scene 4 orbit focus is active */
  isOrbitActive?: boolean
  /** Whether rotation is driven by user manual interaction (drag, keys, wheel, targeting) */
  isManual?: boolean
  /** Whether the user is currently holding down finger or mouse/pointer (suppresses spin audio until released) */
  isHolding?: boolean
  /** Whether a button or programmatic transition between scenes is active (3 <-> 4, 5 -> 3, etc.) */
  isTransition?: boolean
  /** Smooth envelope / gain factor for the transition wind [0.0 .. 1.0] */
  transitionGain?: number
}

type AudioListener = (state: AudioEngineState) => void

const AUDIO_STORAGE_KEY = 'steamdeck_audio_muted'

class SoundManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private sfxGain: GainNode | null = null
  private uiGain: GainNode | null = null
  private ambientGain: GainNode | null = null
  private ambientSource: AudioBufferSourceNode | null = null
  private ambientFilter: BiquadFilterNode | null = null
  private proceduralAmbientOscs: OscillatorNode[] = []
  private ambientTimer: ReturnType<typeof setTimeout> | null = null
  private sharedNoiseBuffer: AudioBuffer | null = null
  private planetWindSource: AudioBufferSourceNode | null = null
  private planetWindGain: GainNode | null = null
  private planetWindFilter: BiquadFilterNode | null = null
  private planetWindPanner: StereoPannerNode | null = null
  private planetWindActiveSession: boolean = false
  private planetWindLastDir: 'forward' | 'reverse' | null = null
  private lastPlanetVel: number = 0
  private lastScreenX: number = 0
  private lastProximity: number = 0
  private lastIsManual: boolean = false
  private lastIsHolding: boolean = false
  private lastIsTransition: boolean = false
  private lastTransitionGain: number = 0

  // Continuous manual planet spin loop (gentle, soft aerodynamic air glide)
  private planetSpinSource: AudioBufferSourceNode | null = null
  private planetSpinGain: GainNode | null = null
  private planetSpinFilter: BiquadFilterNode | null = null
  private planetSpinHP: BiquadFilterNode | null = null
  private planetSpinPanner: StereoPannerNode | null = null
  private planetSpinStopTimer: ReturnType<typeof setTimeout> | null = null

  // Vacuum portal audio voice
  private portalVoiceSource: AudioBufferSourceNode | null = null
  private portalVoiceGain: GainNode | null = null
  private portalMotionSource: AudioBufferSourceNode | null = null
  private portalMotionGain: GainNode | null = null
  private portalMotionFilter: BiquadFilterNode | null = null
  private portalMotionHP: BiquadFilterNode | null = null
  private portalMotionPanner: StereoPannerNode | null = null
  private portalMotionStopTimer: ReturnType<typeof setTimeout> | null = null
  private lastPortalProgress: number = 0
  private lastPortalTime: number = 0
  private lastPortalVel: number = 0
  private lastPortalPhase: 'idle' | 'opening' | 'closing' = 'idle'
  private portalSealTriggered: boolean = false
  private portalUnlatchTriggered: boolean = false

  // Continuous dynamic crystal motion (coupled to 3D crystal emergence & dispersal)
  private crystalMotionSource: AudioBufferSourceNode | null = null
  private crystalMotionGain: GainNode | null = null
  private crystalMotionFilter: BiquadFilterNode | null = null
  private crystalMotionStopTimer: ReturnType<typeof setTimeout> | null = null
  private lastCrystalProgress: number = 0
  private lastCrystalTime: number = 0
  private lastCrystalVel: number = 0

  // In-memory decoded AudioBuffers
  private buffers: Map<string, AudioBuffer> = new Map()
  private bufferLoadingPromises: Map<string, Promise<void>> = new Map()

  // State
  private isMuted: boolean = true
  private isInitialized: boolean = false
  private volume: number = 0.88
  private isAmbientPlaying: boolean = false
  private listeners: Set<AudioListener> = new Set()
  private shutterPhase: 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom' = 'idle'
  private shutterPhaseStartTime: number = 0

  // Throttling timestamps
  private lastHackyTickTime: number = 0
  private lastHoverTime: number = 0
  private lastHapticTime: number = 0

  constructor() {
    // Always start with audio muted by default upon opening or reloading the site
    this.isMuted = true

    if (typeof window !== 'undefined') {
      // Auto-unlock on first user interaction
      const unlock = () => {
        this.init()
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
        window.removeEventListener('wheel', unlock)
        window.removeEventListener('touchstart', unlock)
      }
      window.addEventListener('pointerdown', unlock, { passive: true })
      window.addEventListener('keydown', unlock, { passive: true })
      window.addEventListener('wheel', unlock, { passive: true })
      window.addEventListener('touchstart', unlock, { passive: true })

      // Handle visibility change (pause ambient when tab is hidden)
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return
        if (document.hidden) {
          if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
          }
        } else {
          if (this.masterGain) {
            const target = this.isMuted ? 0 : this.volume
            this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08)
          }
        }
      })
    }
  }

  /**
   * Initializes the AudioContext and routing graph on user gesture.
   */
  public init(): boolean {
    if (typeof window === 'undefined') return false
    if (this.ctx && this.ctx.state === 'running') {
      this.isInitialized = true
      return true
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!this.ctx) {
        this.ctx = new AudioCtx()
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume()
      }

      // Build Master Audio Graph
      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume

        // Master Limiter: Transparent peak ceiling protection without crushing dynamic range
        this.compressor = this.ctx.createDynamicsCompressor()
        this.compressor.threshold.setValueAtTime(-1.5, this.ctx.currentTime)
        this.compressor.knee.setValueAtTime(0.0, this.ctx.currentTime)
        this.compressor.ratio.setValueAtTime(20.0, this.ctx.currentTime)
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime)
        this.compressor.release.setValueAtTime(0.06, this.ctx.currentTime)

        // Sub Busses calibrated for professional LUFS staging (-20 to -18 LUFS overall)
        this.sfxGain = this.ctx.createGain()
        this.sfxGain.gain.value = 0.42

        this.uiGain = this.ctx.createGain()
        this.uiGain.gain.value = 0.42

        // Ambient Bus: Lowpass Filter -> Gain -> Master
        this.ambientFilter = this.ctx.createBiquadFilter()
        this.ambientFilter.type = 'lowpass'
        this.ambientFilter.frequency.setValueAtTime(350, this.ctx.currentTime)

        // Ambient background level calibrated to avoid masking interface audio
        this.ambientGain = this.ctx.createGain()
        this.ambientGain.gain.value = 0.0

        // Planet Wind Sub-graph (Coupled directly to 3D planet rotational velocity)
        this.planetWindGain = this.ctx.createGain()
        this.planetWindGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

        this.planetWindFilter = this.ctx.createBiquadFilter()
        this.planetWindFilter.type = 'lowpass'
        this.planetWindFilter.frequency.setValueAtTime(5000, this.ctx.currentTime)
        this.planetWindFilter.Q.setValueAtTime(0.5, this.ctx.currentTime)

        if (this.ctx.createStereoPanner) {
          this.planetWindPanner = this.ctx.createStereoPanner()
          this.planetWindPanner.pan.setValueAtTime(0, this.ctx.currentTime)
          this.planetWindFilter.connect(this.planetWindPanner)
          this.planetWindPanner.connect(this.planetWindGain)
        } else {
          this.planetWindFilter.connect(this.planetWindGain)
        }

        this.planetWindGain.connect(this.sfxGain)

        // Continuous Manual Planet Spin Loop Sub-graph (Velvety, soft, non-fatiguing air flow)
        this.planetSpinGain = this.ctx.createGain()
        this.planetSpinGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

        // Gentle Highpass Filter (180 Hz): completely eliminates low-end rumble or brick-like friction
        this.planetSpinHP = this.ctx.createBiquadFilter()
        this.planetSpinHP.type = 'highpass'
        this.planetSpinHP.frequency.setValueAtTime(180, this.ctx.currentTime)
        this.planetSpinHP.Q.setValueAtTime(0.707, this.ctx.currentTime)

        // Dynamic Airy Lowpass Filter: breathes naturally between 2600 Hz and 4800 Hz
        this.planetSpinFilter = this.ctx.createBiquadFilter()
        this.planetSpinFilter.type = 'lowpass'
        this.planetSpinFilter.frequency.setValueAtTime(2800, this.ctx.currentTime)
        this.planetSpinFilter.Q.setValueAtTime(0.5, this.ctx.currentTime)

        this.planetSpinHP.connect(this.planetSpinFilter)

        if (this.ctx.createStereoPanner) {
          this.planetSpinPanner = this.ctx.createStereoPanner()
          this.planetSpinPanner.pan.setValueAtTime(0, this.ctx.currentTime)
          this.planetSpinFilter.connect(this.planetSpinPanner)
          this.planetSpinPanner.connect(this.planetSpinGain)
        } else {
          this.planetSpinFilter.connect(this.planetSpinGain)
        }

        this.planetSpinGain.connect(this.sfxGain)

        // Portal Motion Sub-graph (Coupled directly to Mecha Portal Aperture movement)
        this.portalMotionGain = this.ctx.createGain()
        this.portalMotionGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

        this.portalMotionHP = this.ctx.createBiquadFilter()
        this.portalMotionHP.type = 'highpass'
        this.portalMotionHP.frequency.setValueAtTime(180, this.ctx.currentTime)
        this.portalMotionHP.Q.setValueAtTime(0.707, this.ctx.currentTime)

        this.portalMotionFilter = this.ctx.createBiquadFilter()
        this.portalMotionFilter.type = 'lowpass'
        this.portalMotionFilter.frequency.setValueAtTime(450, this.ctx.currentTime)
        this.portalMotionFilter.Q.setValueAtTime(0.65, this.ctx.currentTime)

        this.portalMotionHP.connect(this.portalMotionFilter)

        if (this.ctx.createStereoPanner) {
          this.portalMotionPanner = this.ctx.createStereoPanner()
          this.portalMotionPanner.pan.setValueAtTime(0, this.ctx.currentTime)
          this.portalMotionFilter.connect(this.portalMotionPanner)
          this.portalMotionPanner.connect(this.portalMotionGain)
        } else {
          this.portalMotionFilter.connect(this.portalMotionGain)
        }

        this.portalMotionGain.connect(this.sfxGain)

        // Crystal Motion Sub-graph (Coupled directly to 3D crystal emergence & dispersal)
        this.crystalMotionGain = this.ctx.createGain()
        this.crystalMotionGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

        this.crystalMotionFilter = this.ctx.createBiquadFilter()
        this.crystalMotionFilter.type = 'lowpass'
        this.crystalMotionFilter.frequency.setValueAtTime(450, this.ctx.currentTime)
        this.crystalMotionFilter.Q.setValueAtTime(0.7, this.ctx.currentTime)

        this.crystalMotionFilter.connect(this.crystalMotionGain)
        this.crystalMotionGain.connect(this.sfxGain)

        // Connect graph
        this.sfxGain.connect(this.masterGain)
        this.uiGain.connect(this.masterGain)
        this.ambientFilter.connect(this.ambientGain)
        this.ambientGain.connect(this.masterGain)

        this.masterGain.connect(this.compressor)
        this.compressor.connect(this.ctx.destination)
      }

      if (!this.sharedNoiseBuffer && this.ctx) {
        const bufferSize = Math.floor(this.ctx.sampleRate * 2.0)
        this.sharedNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = this.sharedNoiseBuffer.getChannelData(0)
        let b0 = 0, b1 = 0, b2 = 0
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1
          b0 = 0.99765 * b0 + white * 0.0990460
          b1 = 0.96300 * b1 + white * 0.1226466
          b2 = 0.57000 * b2 + white * 0.4836578
          data[i] = (b0 + b1 + b2) * 0.25
        }
      }

      this.isInitialized = true
      this.preloadSamples()
      this.notify()
      return true
    } catch (e) {
      console.warn('AudioContext initialization deferred:', e)
      return false
    }
  }

  public unlock(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  /**
   * Preloads studio WAV buffers in the background.
   */
  private preloadSamples() {
    const samples = [
      'boot_chime',
      'haptic_click',
      'shutter_close',
      'shutter_open',
      'shutter_snap',
      'portal_open',
      'portal_close',
      'portal_warp',
      'portal_motion_loop',
      'portal_seal',
      'portal_unlatch',
      'crystal_transition',
      'crystal_reverse',
      'crystal_motion_loop',
      'planet_wind_whoosh',
      'planet_wind_reverse',
      'planet_spin_loop',
      'game_switch',
      'hover_chirp',
      'button_click',
      'telemetry_blip',
      'cart_add',
      'ambient_drone',
    ]

    samples.forEach((name) => {
      if (this.buffers.has(name) || this.bufferLoadingPromises.has(name)) return

      const promise = fetch(`/audio/${name}.wav`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.arrayBuffer()
        })
        .then((arrayBuffer) => {
          if (!this.ctx) return
          return this.ctx.decodeAudioData(arrayBuffer)
        })
        .then((decoded) => {
          if (decoded) {
            this.buffers.set(name, decoded)
            if (name === 'ambient_drone' && this.isAmbientPlaying && !this.ambientSource && !this.isMuted) {
              this.stopAmbient()
              this.startAmbient()
            }
          }
        })
        .catch(() => {
          // Silent fallback to procedural synthesis
        })

      this.bufferLoadingPromises.set(name, promise)
    })
  }

  /**
   * State management & React Subscription
   */
  public getState(): AudioEngineState {
    return {
      isMuted: this.isMuted,
      isInitialized: this.isInitialized,
      volume: this.volume,
      isAmbientPlaying: this.isAmbientPlaying,
    }
  }

  public subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    const state = this.getState()
    this.listeners.forEach((l) => l(state))
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted)
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted
    trackEvent('sound_toggle', { muted })
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(AUDIO_STORAGE_KEY, String(muted))
      } catch (_) {}
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime
      const target = muted ? 0 : this.volume
      this.masterGain.gain.cancelScheduledValues(now)
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
      this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.001, target), now + 0.05)
      if (muted) {
        this.masterGain.gain.setValueAtTime(0, now + 0.051)
      }
    }

    if (!muted) {
      this.init()
      this.playHaptic(1.0)
      if (!this.isAmbientPlaying) {
        this.startAmbient()
      }
    }

    this.notify()
    return this.isMuted
  }

  /**
   * Helper to play an AudioBuffer with stereo pan and pitch variation
   */
  private playBuffer(
    bufferName: string,
    bus: GainNode | null,
    options?: { pan?: number; pitchVariation?: number; volume?: number; offset?: number }
  ): boolean {
    if (this.isMuted || !this.ctx || !bus) return false
    const buffer = this.buffers.get(bufferName)
    if (!buffer) return false

    try {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer

      if (options?.pitchVariation) {
        const detune = (Math.random() * 2 - 1) * options.pitchVariation
        source.playbackRate.value = 1.0 + detune
      }

      let lastNode: AudioNode = source

      if (options?.volume && options.volume !== 1.0) {
        const gain = this.ctx.createGain()
        gain.gain.value = options.volume
        source.connect(gain)
        lastNode = gain
      }

      if (options?.pan && this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, options.pan))
        lastNode.connect(panner)
        lastNode = panner
      }

      lastNode.connect(bus)
      source.start(0, options?.offset || 0)
      return true
    } catch (_) {
      return false
    }
  }

  /**
   * Steam Deck boot chime: 4-note ascending arpeggio (C#4 -> F#4 -> A#4 -> C#5).
   */
  public playBootChime() {
    this.init()
    if (this.isMuted || !this.ctx) return

    // Play master sample if decoded
    if (this.playBuffer('boot_chime', this.sfxGain, { volume: 0.32 })) {
      return
    }

    // Procedural fallback: 4-note ascending chime arpeggio spaced by 80ms
    const now = this.ctx.currentTime
    const notes = [
      { freq: 277.18, offset: 0.00, dur: 1.4, amp: 0.20 }, // C#4
      { freq: 369.99, offset: 0.08, dur: 1.6, amp: 0.22 }, // F#4
      { freq: 466.16, offset: 0.16, dur: 1.8, amp: 0.24 }, // A#4
      { freq: 554.37, offset: 0.25, dur: 2.2, amp: 0.26 }, // C#5
    ]

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1400, now)
    filter.Q.setValueAtTime(0.707, now)

    notes.forEach((note) => {
      if (!this.ctx) return
      const tStart = now + note.offset
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, tStart)

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0.001, tStart)
      gain.gain.exponentialRampToValueAtTime(note.amp, tStart + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, tStart + note.dur)

      osc.connect(gain)
      gain.connect(filter)
      osc.start(tStart)
      osc.stop(tStart + note.dur + 0.02)
    })

    if (this.sfxGain) filter.connect(this.sfxGain)
  }

  /**
   * Valve Trackpad LRA haptic click simulation for slider and drag interactions.
   */
  public playHaptic(intensity: number = 1.0, pan?: number) {
    const nowMs = performance.now()
    if (nowMs - this.lastHapticTime < 25) return // Throttled to max 40 clicks/sec
    this.lastHapticTime = nowMs

    this.init()
    if (this.isMuted || !this.ctx) return

    if (this.playBuffer('haptic_click', this.uiGain, { pan, pitchVariation: 0.03, volume: 0.24 * intensity })) {
      return
    }

    // Procedural fallback: bandpass noise click + 160Hz LRA core
    const now = this.ctx.currentTime

    // 160Hz LRA resonance
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, now)

    const oscGain = this.ctx.createGain()
    oscGain.gain.setValueAtTime(0.18 * intensity, now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

    osc.connect(oscGain)

    // Bandpass noise impulse
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.025)
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

      const source = this.ctx.createBufferSource()
      source.buffer = noiseBuffer

      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(1100, now)
      bp.Q.setValueAtTime(1.8, now)

      const noiseGain = this.ctx.createGain()
      noiseGain.gain.setValueAtTime(0.12 * intensity, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025)

      source.connect(bp)
      bp.connect(noiseGain)

      if (this.uiGain) noiseGain.connect(this.uiGain)
      source.start(now)
    } catch (_) {}

    if (this.uiGain) oscGain.connect(this.uiGain)
    osc.start(now)
    osc.stop(now + 0.035)
  }

  /**
   * Subtle UI hover tone.
   */
  public playHover(pan?: number) {
    const nowMs = performance.now()
    if (nowMs - this.lastHoverTime < 75) return // Throttled to max 13 hovers/sec
    this.lastHoverTime = nowMs

    this.init()
    if (this.isMuted || !this.ctx) return

    if (this.playBuffer('hover_chirp', this.uiGain, { pan, volume: 0.12 })) {
      return
    }

    // Procedural fallback: gentle 1800Hz sine tap
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1800, now)

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)

    osc.connect(gain)
    if (this.uiGain) gain.connect(this.uiGain)
    osc.start(now)
    osc.stop(now + 0.05)
  }

  /**
   * Affirmative UI button click.
   */
  private lastClickTime: number = 0

  public playButtonClick(pan?: number) {
    const nowMs = performance.now()
    if (nowMs - this.lastClickTime < 35) return // Throttled to max 28 clicks/sec
    this.lastClickTime = nowMs

    this.init()
    if (this.isMuted || !this.ctx) return

    if (this.playBuffer('button_click', this.uiGain, { pan, pitchVariation: 0.02, volume: 0.20 })) {
      return
    }

    // Procedural Fallback: Velvety sine tap (in the exact same acoustic family as hover)
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1420, now)
    osc.frequency.exponentialRampToValueAtTime(960, now + 0.035)

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042)

    osc.connect(gain)
    if (this.uiGain) gain.connect(this.uiGain)
    osc.start(now)
    osc.stop(now + 0.045)
  }

  public playClick(pan?: number) {
    this.playButtonClick(pan)
  }

  /**
   * Blade shutter optical cut sound (close and open).
   */
  public playShutterCut(action: 'close' | 'open' | 'closing' | 'slide' = 'close') {
    this.init()
    if (this.isMuted || !this.ctx) return

    if (action === 'slide') {
      this.playShutterSlide()
      return
    }

    // Sound of closing is like opening: satisfying smooth pneumatic air whoosh
    if (action === 'open' || action === 'closing') {
      if (this.playBuffer('shutter_open', this.sfxGain, { volume: 0.28, pitchVariation: 0.02 })) {
        return
      }

      // Procedural Fallback: Smooth pneumatic air release
      const now = this.ctx.currentTime
      try {
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.15)
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1

        const source = this.ctx.createBufferSource()
        source.buffer = noiseBuffer

        const bp = this.ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.setValueAtTime(320, now)
        bp.Q.setValueAtTime(1.0, now)

        const airGain = this.ctx.createGain()
        airGain.gain.setValueAtTime(0.001, now)
        airGain.gain.exponentialRampToValueAtTime(0.12, now + 0.03)
        airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)

        source.connect(bp)
        bp.connect(airGain)
        if (this.sfxGain) airGain.connect(this.sfxGain)
        source.start(now)
      } catch (_) {}

      // Soft mechanical unlatch thump
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(85, now)
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.08)

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

      osc.connect(gain)
      if (this.sfxGain) gain.connect(this.sfxGain)
      osc.start(now)
      osc.stop(now + 0.1)
      return
    }

    // --- Action === 'close' (The clap / latch) ---
    // Softened subtle volume for tactile collision without overpowering the slide whoosh
    if (
      this.playBuffer('shutter_close', this.sfxGain, { volume: 0.08, pitchVariation: 0.02 }) ||
      this.playBuffer('shutter_snap', this.sfxGain, { volume: 0.08, pitchVariation: 0.02 })
    ) {
      return
    }

    // Procedural Fallback: Softer mechanical latch slam
    const now = this.ctx.currentTime

    // Damped chassis thump (95Hz)
    const thump = this.ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(95, now)
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.1)

    const thumpGain = this.ctx.createGain()
    thumpGain.gain.setValueAtTime(0.06, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    thump.connect(thumpGain)
    if (this.sfxGain) thumpGain.connect(this.sfxGain)
    thump.start(now)
    thump.stop(now + 0.13)

    // Latch contact click (bandpass noise)
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.05)
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1

      const source = this.ctx.createBufferSource()
      source.buffer = noiseBuffer

      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(780, now)
      bp.Q.setValueAtTime(2.2, now)

      const noiseGain = this.ctx.createGain()
      noiseGain.gain.setValueAtTime(0.04, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

      source.connect(bp)
      bp.connect(noiseGain)
      if (this.sfxGain) noiseGain.connect(this.sfxGain)
      source.start(now)
    } catch (_) {}
  }

  /**
   * Aerodynamic blade slide whoosh while shutters travel from edges to center (1.05s).
   */
  public playShutterSlide() {
    this.init()
    if (this.isMuted || !this.ctx) return
    const now = this.ctx.currentTime
    try {
      const dur = 1.05
      const bufferSize = Math.floor(this.ctx.sampleRate * dur)
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      let b0 = 0, b1 = 0
      for (let i = 0; i < bufferSize; i++) {
        const t = i / this.ctx.sampleRate
        const u = t / dur
        const white = Math.random() * 2 - 1
        b0 = 0.99 * b0 + white * 0.05
        b1 = 0.95 * b1 + white * 0.10
        const pink = (b0 + b1) * 0.4
        // Crescendo swell as blades rush towards each other
        const slideEnv = Math.pow(u, 1.3) * (1 - Math.exp(-t * 15))
        output[i] = pink * slideEnv * 0.20
      }

      const source = this.ctx.createBufferSource()
      source.buffer = noiseBuffer

      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(280, now)
      bp.frequency.exponentialRampToValueAtTime(420, now + dur)
      bp.Q.setValueAtTime(1.1, now)

      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(550, now)
      lp.Q.setValueAtTime(0.707, now)

      const slideGain = this.ctx.createGain()
      slideGain.gain.setValueAtTime(0.18, now)

      source.connect(bp)
      bp.connect(lp)
      lp.connect(slideGain)
      if (this.sfxGain) slideGain.connect(this.sfxGain)
      source.start(now)
    } catch (_) {}
  }

  public setShutterPhase(phase: 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom') {
    if (this.shutterPhase !== phase) {
      this.shutterPhase = phase
      this.shutterPhaseStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
    }
  }

  public getShutterPhase(): 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom' {
    return this.shutterPhase
  }

  /**
   * Acoustic crystal resonance for Scene 5.
   */
  private ensureCrystalMotionLoop() {
    if (!this.ctx) return
    if (this.crystalMotionStopTimer) {
      clearTimeout(this.crystalMotionStopTimer)
      this.crystalMotionStopTimer = null
    }
    if (this.crystalMotionSource) return

    const buffer = this.buffers.get('crystal_motion_loop') || this.buffers.get('crystal_transition')
    if (!buffer || !this.crystalMotionFilter) return

    try {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.playbackRate.setValueAtTime(1.0, this.ctx.currentTime)
      source.connect(this.crystalMotionFilter)
      source.start(0)
      this.crystalMotionSource = source

      source.onended = () => {
        if (this.crystalMotionSource === source) {
          this.crystalMotionSource = null
        }
      }
    } catch (_) {}
  }

  /**
   * Real-time acoustic crystal resonance coupled to 3D crystal emergence & dispersal.
   * Plays in pair with the aerodynamic wind sound during crystal spin and flight.
   */
  public updateCrystalMotion(
    phase: 'idle' | 'transitioning',
    progress: number = 0,
    _direction: 'forward' | 'reverse' = 'forward'
  ) {
    if (this.isMuted || !this.ctx || !this.crystalMotionGain || !this.crystalMotionFilter) return

    const now = this.ctx.currentTime
    const p = Math.max(0, Math.min(1, progress))

    if (phase === 'transitioning') {
      let vel = 0.5
      if (this.lastCrystalTime > 0) {
        const dt = Math.max(0.008, Math.min(0.12, now - this.lastCrystalTime))
        const dp = Math.abs(p - this.lastCrystalProgress)
        const instantVel = dp / dt
        vel = this.lastCrystalVel * 0.65 + instantVel * 0.35
      }
      this.lastCrystalProgress = p
      this.lastCrystalTime = now
      this.lastCrystalVel = vel

      this.ensureCrystalMotionLoop()

      const speedNorm = Math.min(1.2, Math.max(0.25, vel / 0.65))

      // Motion envelope: tracks the arc of crystal dispersal & flight (working in pair with wind)
      const motionEnvelope = Math.pow(Math.sin(p * Math.PI), 0.75)
      const targetVol = Math.min(0.14, 0.11 * speedNorm * Math.max(0.08, motionEnvelope))
      this.crystalMotionGain.gain.setTargetAtTime(targetVol, now, 0.04)

      // Airy crystal shimmer filter: sweeps smoothly across the flight
      const targetCutoff = 800 + 1400 * Math.pow(p, 0.75)
      this.crystalMotionFilter.frequency.setTargetAtTime(targetCutoff, now, 0.05)
      return
    }

    // Phase is 'idle': smoothly fade out to serene silence
    this.crystalMotionGain.gain.setTargetAtTime(0.0, now, 0.08)
    this.lastCrystalProgress = 0
    this.lastCrystalTime = 0
    this.lastCrystalVel = 0

    if (!this.crystalMotionStopTimer) {
      this.crystalMotionStopTimer = setTimeout(() => {
        if (this.crystalMotionSource) {
          try {
            this.crystalMotionSource.stop()
            this.crystalMotionSource.disconnect()
          } catch (_) {}
            this.crystalMotionSource = null
          }
        this.crystalMotionStopTimer = null
      }, 400)
    }
  }

  public playCrystalTransition(direction: 'forward' | 'reverse' = 'forward') {
    this.updateCrystalMotion('transitioning', 0.5, direction)
  }

  /**
   * Dynamic portal motion audio coupled to aperture movement.
   */
  private ensurePortalMotionLoop() {
    if (!this.ctx) return
    if (this.portalMotionStopTimer) {
      clearTimeout(this.portalMotionStopTimer)
      this.portalMotionStopTimer = null
    }
    if (this.portalMotionSource) return

    const buffer = this.buffers.get('portal_motion_loop') || this.sharedNoiseBuffer
    if (!buffer || !this.portalMotionHP) return

    try {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.playbackRate.setValueAtTime(1.0, this.ctx.currentTime)
      source.connect(this.portalMotionHP)
      source.start(0)
      this.portalMotionSource = source

      source.onended = () => {
        if (this.portalMotionSource === source) {
          this.portalMotionSource = null
        }
      }
    } catch (_) {}
  }

  /**
   * Stops the active Scene 5 vacuum portal voice with a smooth fade to prevent clipping.
   */
  public stopScene5Portal() {
    if (this.portalVoiceGain && this.ctx) {
      try {
        const now = this.ctx.currentTime
        this.portalVoiceGain.gain.cancelScheduledValues(now)
        this.portalVoiceGain.gain.setValueAtTime(this.portalVoiceGain.gain.value, now)
        this.portalVoiceGain.gain.linearRampToValueAtTime(0.0001, now + 0.06)
      } catch (_) {}
    }
    if (this.portalVoiceSource) {
      const src = this.portalVoiceSource
      this.portalVoiceSource = null
      setTimeout(() => {
        try {
          src.stop()
          src.disconnect()
        } catch (_) {}
      }, 70)
    }
  }

  /**
   * Plays the Scene 5 vacuum portal sound effect:
   * - 'open' / 'opening': Atmospheric depressurization, inward air suction, and sub-bass pressure drop (portal_open.wav)
   * - 'close' / 'closing': Reverse vacuum air draw and airtight hermetic latch seal (portal_close.wav)
   */
  public playScene5Portal(action: 'open' | 'close' | 'opening' | 'closing' = 'open') {
    this.init()
    if (this.isMuted || !this.ctx) return

    this.stopScene5Portal()

    const isOpening = action === 'open' || action === 'opening'
    const sampleName = isOpening ? 'portal_open' : 'portal_close'
    const targetVol = isOpening ? 0.35 : 0.38

    const buffer = this.buffers.get(sampleName)
    if (buffer && this.sfxGain) {
      try {
        const source = this.ctx.createBufferSource()
        source.buffer = buffer
        source.loop = false

        const gainNode = this.ctx.createGain()
        gainNode.gain.setValueAtTime(targetVol, this.ctx.currentTime)

        source.connect(gainNode)
        gainNode.connect(this.sfxGain)

        source.start()
        this.portalVoiceSource = source
        this.portalVoiceGain = gainNode

        source.onended = () => {
          if (this.portalVoiceSource === source) {
            this.portalVoiceSource = null
            this.portalVoiceGain = null
          }
        }
        return
      } catch (_) {}
    }

    // Procedural Fallback (Refined Accelerated Quantum Warp - 1.55s, capped 360Hz):
    const now = this.ctx.currentTime
    if (isOpening) {
      try {
        const dur = 1.55
        const bufferSize = Math.floor(this.ctx.sampleRate * dur)
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        let b0 = 0, b1 = 0
        for (let i = 0; i < bufferSize; i++) {
          const t = i / this.ctx.sampleRate
          const u = t / dur
          const white = Math.random() * 2 - 1
          b0 = 0.99 * b0 + white * 0.05
          b1 = 0.95 * b1 + white * 0.10
          const pink = (b0 + b1) * 0.4
          const airEnv = Math.pow(Math.sin(u * Math.PI), 1.25)
          output[i] = pink * airEnv * 0.30
        }

        const source = this.ctx.createBufferSource()
        source.buffer = noiseBuffer

        const bp = this.ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.setValueAtTime(240, now)
        bp.Q.setValueAtTime(1.1, now)

        const lp = this.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(360, now)
        lp.Q.setValueAtTime(0.65, now)

        const airGain = this.ctx.createGain()
        airGain.gain.setValueAtTime(0.26, now)

        source.connect(bp)
        bp.connect(lp)
        lp.connect(airGain)
        if (this.sfxGain) airGain.connect(this.sfxGain)
        source.start(now)
      } catch (_) {}

      // Capped Sub-Harmonic Glide (50Hz -> 64Hz, stays strictly sub-70Hz)
      try {
        const dur = 1.55
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(50, now)
        osc.frequency.linearRampToValueAtTime(64, now + dur * 0.4)
        osc.frequency.linearRampToValueAtTime(56, now + dur)

        const subGain = this.ctx.createGain()
        subGain.gain.setValueAtTime(0.0001, now)
        subGain.gain.linearRampToValueAtTime(0.24, now + dur * 0.38)
        subGain.gain.exponentialRampToValueAtTime(0.001, now + dur)

        osc.connect(subGain)
        if (this.sfxGain) subGain.connect(this.sfxGain)
        osc.start(now)
        osc.stop(now + dur)
      } catch (_) {}

      // Soft 80Hz pneumatic unlatch thump
      try {
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(80, now)
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.16)

        const thumpGain = this.ctx.createGain()
        thumpGain.gain.setValueAtTime(0.0001, now)
        thumpGain.gain.linearRampToValueAtTime(0.16, now + 0.02)
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

        osc.connect(thumpGain)
        if (this.sfxGain) thumpGain.connect(this.sfxGain)
        osc.start(now)
        osc.stop(now + 0.20)
      } catch (_) {}
    } else {
      // Closing: accelerated reverse sub-draw & soft pneumatic seal
      try {
        const dur = 1.55
        const sealTime = 1.38
        const bufferSize = Math.floor(this.ctx.sampleRate * dur)
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        let b0 = 0, b1 = 0
        for (let i = 0; i < bufferSize; i++) {
          const t = i / this.ctx.sampleRate
          const u = Math.min(1, t / sealTime)
          const white = Math.random() * 2 - 1
          b0 = 0.99 * b0 + white * 0.05
          b1 = 0.95 * b1 + white * 0.10
          const pink = (b0 + b1) * 0.4
          const drawEnv = Math.pow(Math.sin(u * Math.PI * 0.5), 1.3) * (t < sealTime ? 1 : Math.exp(-(t - sealTime) * 22))
          output[i] = pink * drawEnv * 0.30
        }

        const source = this.ctx.createBufferSource()
        source.buffer = noiseBuffer

        const bp = this.ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.setValueAtTime(260, now)
        bp.frequency.exponentialRampToValueAtTime(340, now + sealTime)
        bp.Q.setValueAtTime(1.1, now)

        const lp = this.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(360, now)
        lp.Q.setValueAtTime(0.65, now)

        const drawGain = this.ctx.createGain()
        drawGain.gain.setValueAtTime(0.24, now)

        source.connect(bp)
        bp.connect(lp)
        lp.connect(drawGain)
        if (this.sfxGain) drawGain.connect(this.sfxGain)
        source.start(now)
      } catch (_) {}

      // Soft pneumatic seal at sealTime
      try {
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(72, now + 1.38)
        osc.frequency.exponentialRampToValueAtTime(40, now + 1.38 + 0.10)

        const sealGain = this.ctx.createGain()
        sealGain.gain.setValueAtTime(0.0001, now)
        sealGain.gain.setValueAtTime(0.16, now + 1.38)
        sealGain.gain.exponentialRampToValueAtTime(0.001, now + 1.38 + 0.14)

        osc.connect(sealGain)
        if (this.sfxGain) sealGain.connect(this.sfxGain)
        osc.start(now + 1.38)
        osc.stop(now + 1.38 + 0.16)
      } catch (_) {}
    }
  }



  /**
   * Real-time physical aperture audio coupled directly to portal progress.
   * Triggers the vacuum depressurization on opening, and the hermetic airlock seal on closing.
   */
  public updatePortalMotion(
    phase: 'idle' | 'opening' | 'closing',
    _progress: number = 0,
    _sourceScene?: number,
    _targetScene?: number
  ) {
    if (this.isMuted || !this.ctx) return

    if (phase === 'opening') {
      if (this.lastPortalPhase !== 'opening') {
        this.lastPortalPhase = 'opening'
        this.playScene5Portal('open')
      }
      return
    }

    if (phase === 'closing') {
      if (this.lastPortalPhase !== 'closing') {
        this.lastPortalPhase = 'closing'
        this.playScene5Portal('close')
      }
      return
    }

    // Phase is 'idle'
    if (this.lastPortalPhase !== 'idle') {
      this.lastPortalPhase = 'idle'
      this.stopScene5Portal()
    }
  }

  public playPortalUnlatch() {
    this.init()
    if (this.isMuted || !this.ctx) return
    this.playBuffer('portal_unlatch', this.sfxGain, { volume: 0.10 })
  }

  public playPortalSeal() {
    this.init()
    if (this.isMuted || !this.ctx) return
    this.playBuffer('portal_seal', this.sfxGain, { volume: 0.12 })
  }

  public playPortalWarp() {
    this.init()
    if (this.isMuted || !this.ctx) return
    this.playScene5Portal('open')
  }

  /**
   * Planet spin-up wind loop for Scene 3 portal vortex.
   */
  private ensurePlanetSpinLoop() {
    if (this.planetSpinStopTimer) {
      clearTimeout(this.planetSpinStopTimer)
      this.planetSpinStopTimer = null
    }
    if (!this.ctx || this.planetSpinSource) return
    const buffer = this.buffers.get('planet_spin_loop') || this.sharedNoiseBuffer
    if (!buffer || !this.planetSpinFilter) return

    try {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.playbackRate.setValueAtTime(1.0, this.ctx.currentTime)
      source.connect(this.planetSpinHP || this.planetSpinFilter)
      source.start()
      this.planetSpinSource = source
    } catch (_) {}
  }

  public initPlanetWindVoice(direction: 'forward' | 'reverse' = 'forward') {
    if (!this.ctx) return
    const sampleName = direction === 'reverse' ? 'planet_wind_reverse' : 'planet_wind_whoosh'
    const buffer = this.buffers.get(sampleName) || this.buffers.get('planet_wind_whoosh') || this.sharedNoiseBuffer
    if (!buffer || !this.planetWindFilter) return

    if (this.planetWindSource) {
      try {
        this.planetWindSource.stop()
        this.planetWindSource.disconnect()
      } catch (_) {}
      this.planetWindSource = null
    }

    try {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = false // One-shot organic acoustic whoosh (no looping or motor buzz)
      source.playbackRate.setValueAtTime(1.0, this.ctx.currentTime)
      source.connect(this.planetWindFilter)
      source.start()
      source.onended = () => {
        if (this.planetWindSource === source) {
          this.planetWindSource = null
          if (this.ctx && this.planetWindGain) {
            this.planetWindGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05)
          }
        }
      }
      this.planetWindSource = source
    } catch (_) {}
  }

  public playPlanetWindWhoosh(direction: 'forward' | 'reverse' = 'forward') {
    this.init()
    if (this.isMuted || !this.ctx) return
    this.planetWindActiveSession = true
    this.planetWindLastDir = direction
    this.initPlanetWindVoice(direction)
  }

  /**
   * Real-time physical velocity modulation of planet wind & manual spin sounds:
   * 1. Portal transitions (opening/closing): Pristine acoustic Florian Foley whoosh (2.1s duration, peak at 1.2s).
   * 2. Manual rotation (idle portal): Continuous, gentle, velvety aerodynamic air glide that does NOT fatigue the ears.
   */
  public updatePlanetWind(
    velocity: number,
    portalPhase: string = 'idle',
    portalProgress: number = 0,
    spatial?: PlanetWindSpatialOptions
  ) {
    if (!this.ctx) {
      this.init()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }

    if (spatial) {
      if (typeof spatial.screenX === 'number' && !isNaN(spatial.screenX)) {
        this.lastScreenX = Math.max(-1.0, Math.min(1.0, spatial.screenX))
      }
      if (typeof spatial.proximity === 'number' && !isNaN(spatial.proximity)) {
        this.lastProximity = Math.max(0.0, Math.min(1.0, spatial.proximity))
      }
      if (typeof spatial.isManual === 'boolean') {
        this.lastIsManual = spatial.isManual
      }
      if (typeof spatial.isHolding === 'boolean') {
        this.lastIsHolding = spatial.isHolding
      }
      if (typeof spatial.isTransition === 'boolean') {
        this.lastIsTransition = spatial.isTransition
      }
      if (typeof spatial.transitionGain === 'number' && !isNaN(spatial.transitionGain)) {
        this.lastTransitionGain = Math.max(0.0, Math.min(1.0, spatial.transitionGain))
      }
    }

    if (this.isMuted || !this.ctx || !this.planetWindGain || !this.planetWindFilter) return

    const now = this.ctx.currentTime
    const absVel = Math.abs(velocity)
    const isPortalActive = portalPhase === 'opening' || portalPhase === 'closing'
    const isManual = spatial && typeof spatial.isManual === 'boolean' ? spatial.isManual : false
    const isHolding = Boolean(spatial && typeof spatial.isHolding === 'boolean' ? spatial.isHolding : this.lastIsHolding)
    const isTransition = Boolean(spatial && spatial.isTransition)
    const transitionGain = typeof spatial?.transitionGain === 'number' && !isNaN(spatial.transitionGain)
      ? Math.max(0.0, Math.min(1.0, spatial.transitionGain))
      : 0.0

    const SPIN_THRESHOLD = 0.55
    const isSpinning = ((absVel >= SPIN_THRESHOLD && isManual && !isHolding) || isTransition || isPortalActive)

    // Strict direction lock during portal transitions:
    const dir: 'forward' | 'reverse' = portalPhase === 'closing'
      ? 'reverse'
      : portalPhase === 'opening'
        ? 'forward'
        : (velocity >= 0 ? 'forward' : 'reverse')

    // Portal transitions (Scene 1 <-> 3 Cinematic Whoosh)
    if (isPortalActive) {
      if (this.planetSpinStopTimer) {
        clearTimeout(this.planetSpinStopTimer)
        this.planetSpinStopTimer = null
      }
      if (this.planetSpinGain) {
        this.planetSpinGain.gain.setValueAtTime(0.0, now)
      }
      if (this.planetSpinSource) {
        try {
          this.planetSpinSource.stop()
          this.planetSpinSource.disconnect()
        } catch (_) {}
        this.planetSpinSource = null
      }

      // Trigger one pristine transition whoosh on portal phase start:
      if (!this.planetWindActiveSession || this.planetWindLastDir !== dir) {
        this.planetWindActiveSession = true
        this.planetWindLastDir = dir
        this.initPlanetWindVoice(dir)
      }

      if (this.planetWindSource) {
        const p = Math.max(0, Math.min(1, portalProgress))
        let targetVol = 0.0
        if (portalPhase === 'closing') {
          // Rollback (Scene 3 -> 1): slower reverse rotation (~5.2 rad/s vs 9.8 rad/s opening).
          // Calibrated to be quiet, gentle and softer (~0.055 peak vs 0.15 peak):
          const speedNorm = Math.min(1.0, Math.max(0, (absVel - 0.20) / (5.2 - 0.20)))
          const u = 1.0 - p
          const closeEnvelope = Math.sin(u * Math.PI)
          targetVol = Math.pow(speedNorm, 0.9) * 0.085 * Math.max(0.35, closeEnvelope)
        } else {
          // Opening (Scene 1 -> 3): fast cinematic spin (9.8 rad/s), full airy burst (~0.15 peak):
          const speedNorm = Math.min(1.0, Math.max(0, (absVel - 0.20) / (9.8 - 0.20)))
          const apertureWeight = Math.sin(p * Math.PI)
          targetVol = Math.pow(speedNorm, 1.0) * 0.15 * Math.max(0.30, apertureWeight)
        }

        this.planetWindGain.gain.setTargetAtTime(targetVol, now, 0.04)

        // Flat natural acoustic playback:
        const targetPitch = 0.98 + (absVel / 10.0) * 0.04
        this.planetWindSource.playbackRate.setTargetAtTime(targetPitch, now, 0.04)

        const targetCutoff = 4500 + Math.min(1.0, absVel / 8.0) * 3200
        this.planetWindFilter.frequency.setTargetAtTime(targetCutoff, now, 0.04)

        if (this.planetWindPanner) {
          // Spatial tracking: during aperture opening, planet is in center (screenX ≈ 0 -> pan = 0).
          // As it settles into Scene 3 position, it glides to slightly left (screenX ≈ -0.34 -> pan ≈ -0.30).
          const basePan = this.lastScreenX * 0.88
          const targetPan = Math.max(-0.80, Math.min(0.80, basePan))
          this.planetWindPanner.pan.setTargetAtTime(targetPan, now, 0.05)
        }
      }

      this.lastPlanetVel = velocity
      return
    }

    // ----------------------------------------------------
    // B. ROTATION AIRFLOW & WIND (Manual Interactive & Scene 3 <-> 4 / 5 -> 3 Transitions)
    // Continuous, velvety, non-fatiguing aerodynamic air glide
    // ----------------------------------------------------
    // Portal transition voice is silent in idle phase:
    if (this.planetWindGain) {
      this.planetWindGain.gain.cancelScheduledValues(0)
      this.planetWindGain.gain.setValueAtTime(0.0, now)
      this.planetWindGain.gain.value = 0
    }
    this.planetWindActiveSession = false
    this.planetWindLastDir = null
    if (this.planetWindSource) {
      try {
        this.planetWindSource.stop()
        this.planetWindSource.disconnect()
      } catch (_) {}
      this.planetWindSource = null
    }

    // If speed is at idle / normal cosmic drift (< 0.55 rad/s) and no transition, smoothly silence continuous spin:
    if (!isSpinning) {
      if (this.planetSpinGain) {
        const fadeTime = isHolding ? 0.02 : 0.04
        this.planetSpinGain.gain.setTargetAtTime(0.0, now, fadeTime)
      }
      if (!this.planetSpinStopTimer && this.planetSpinSource) {
        const stopDelay = isHolding ? 80 : 250
        this.planetSpinStopTimer = setTimeout(() => {
          this.planetSpinStopTimer = null
          if (this.planetSpinSource) {
            try {
              this.planetSpinSource.stop()
              this.planetSpinSource.disconnect()
            } catch (_) {}
            this.planetSpinSource = null
          }
          if (this.ctx && this.planetSpinGain) {
            this.planetSpinGain.gain.cancelScheduledValues(this.ctx.currentTime)
            this.planetSpinGain.gain.setValueAtTime(0.0, this.ctx.currentTime)
          }
        }, stopDelay)
      }
      this.lastPlanetVel = velocity
      return
    }

    // Active manual rotation or scene transition: ensure continuous spin loop is running:
    this.ensurePlanetSpinLoop()

    if (this.planetSpinGain && this.planetSpinFilter) {
      const prox = this.lastProximity

      let targetSpinVol = 0.0
      let targetCutoff = 2800
      let targetPitch = 1.0

      if (isTransition) {
        // Programmatic transition (Scene 3 <-> 4, 5 -> 3):
        // Acoustically calibrated to match the gentle arrival at Scene 3 and crystal rustle (~0.065-0.075).
        // Velocity is strictly clamped so the wind loop never howls or shrieks from high speed:
        const clampedVel = Math.min(1.65, Math.max(0.60, absVel))
        const transNorm = (clampedVel - SPIN_THRESHOLD) / (1.65 - SPIN_THRESHOLD)
        
        // Peak volume ~0.085 modulated by transition envelope:
        const baseTransVol = 0.062 + Math.pow(Math.max(0, transNorm), 0.75) * 0.038
        targetSpinVol = baseTransVol * transitionGain

        // Warm, velvety, open aerodynamic filter (no whistling highs):
        targetCutoff = 3100 + prox * 400

        // Natural, unpitched aerodynamic glide (1:1 playback rate):
        targetPitch = 0.98 + transNorm * 0.03
      } else {
        // Manual spin-up: starts strictly at 0.0 volume at SPIN_THRESHOLD (0.55 rad/s)
        const manualNorm = Math.min(1.0, Math.max(0, (absVel - SPIN_THRESHOLD) / 4.0))

        // Proximity boost when browsing/flipping orbit in Scene 4 (+45% volume boost):
        const proxGainBoost = 1.0 + prox * 0.45
        targetSpinVol = Math.pow(manualNorm, 1.1) * 0.13 * proxGainBoost

        // Open airy breeze filter:
        // In Scene 3: 2600 Hz (warm gentle breeze) to 4800 Hz (silky open air rush)
        // In Scene 4 up close: opens up to 3200 Hz - 6200 Hz for intimate, crisp high-frequency detail
        const baseCutoff = 2600 + prox * 600
        const dynRange = 2200 + prox * 1400
        targetCutoff = baseCutoff + manualNorm * dynRange

        // Subtle aerodynamic pitch variation with spin speed:
        targetPitch = 0.94 + manualNorm * 0.12
      }

      this.planetSpinGain.gain.setTargetAtTime(targetSpinVol, now, 0.05)
      this.planetSpinFilter.frequency.setTargetAtTime(targetCutoff, now, 0.05)

      if (this.planetSpinSource) {
        this.planetSpinSource.playbackRate.setTargetAtTime(targetPitch, now, 0.05)
      }

      // Spatial stereophonic panning:
      // Base pan tracks 3D screen position:
      // - Scene 3 main stance: screenX ≈ -0.34 -> basePan ≈ -0.30 (slightly left)
      // - Scene 4 orbit stance: screenX ≈ 0.0 -> basePan = 0.0 (centered)
      // Swirl pan adds rotational airflow in the direction of spin:
      if (this.planetSpinPanner) {
        const basePan = this.lastScreenX * 0.88
        const rotSign = velocity >= 0 ? 1 : -1
        const swirlAmount = isTransition
          ? rotSign * 0.06
          : rotSign * Math.min(1.0, absVel / 3.5) * (0.08 + prox * 0.08)
        const finalPan = Math.max(-0.85, Math.min(0.85, basePan + swirlAmount))
        this.planetSpinPanner.pan.setTargetAtTime(finalPan, now, 0.05)
      }
    }

    this.lastPlanetVel = velocity
  }

  public getPlanetWindDebugState() {
    return {
      gain: this.planetWindGain ? this.planetWindGain.gain.value : 0,
      spinGain: this.planetSpinGain ? this.planetSpinGain.gain.value : 0,
      cutoff: this.planetWindFilter ? this.planetWindFilter.frequency.value : 0,
      spinCutoff: this.planetSpinFilter ? this.planetSpinFilter.frequency.value : 0,
      pitch: this.planetWindSource ? this.planetWindSource.playbackRate.value : 0,
      pan: this.planetWindPanner ? this.planetWindPanner.pan.value : 0,
      spinPan: this.planetSpinPanner ? this.planetSpinPanner.pan.value : 0,
      screenX: this.lastScreenX,
      proximity: this.lastProximity,
      isManual: this.lastIsManual,
      isTransition: this.lastIsTransition,
      transitionGain: this.lastTransitionGain,
      isMuted: this.isMuted,
      hasSource: !!this.planetWindSource,
      hasSpinSource: !!this.planetSpinSource,
    }
  }

  /**
   * Game reel jog dial switch sound.
   */
  public playGameSwitch(direction: 1 | -1 = 1) {
    this.init()
    if (this.isMuted || !this.ctx) return

    // If button click was already triggered by user click within 90ms, do not double-play
    const nowMs = performance.now()
    if (nowMs - this.lastClickTime < 90) return

    const pan = direction * 0.25
    if (this.playBuffer('game_switch', this.uiGain, { pan, pitchVariation: 0.02, volume: 0.20 })) {
      return
    }

    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    const baseFreq = direction >= 0 ? 1420 : 1340
    osc.frequency.setValueAtTime(baseFreq, now)
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.035)

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

    osc.connect(gain)
    if (this.uiGain) gain.connect(this.uiGain)
    osc.start(now)
    osc.stop(now + 0.045)
  }

  /**
   * Game confirmation select chime.
   */
  public playGameSelect() {
    this.init()
    if (this.isMuted || !this.ctx) return

    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.06)

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

    osc.connect(gain)
    if (this.uiGain) gain.connect(this.uiGain)
    osc.start(now)
    osc.stop(now + 0.07)
  }

  /**
   * Tactile typewriter tick for HackyText scramble reveal.
   */
  public playHackyTick(char?: string, options?: HackyTickOptions) {
    this.init()
    if (this.isMuted || !this.ctx) return

    const nowMs = performance.now()
    if (nowMs - this.lastHackyTickTime < 16) return
    this.lastHackyTickTime = nowMs

    try {
      const now = this.ctx.currentTime + (options?.delaySec || 0)
      const intensity = Math.max(0.1, Math.min(2.0, options?.intensity ?? 1.0))
      const isReverse = options?.isReverse ?? false

      // 1. Acoustic fingerprint derived from character semantics & frequency
      let clickFreq = 1600
      let bodyFreq = 145
      let clickQ = 2.4
      let noiseAmp = 0.085
      let bodyAmp = 0.040
      let decay = 0.016

      if (!char || char === ' ') {
        // Spacebar: deep, woody mechanical thud
        clickFreq = 620
        bodyFreq = 95
        clickQ = 1.3
        noiseAmp = 0.06
        bodyAmp = 0.06
        decay = 0.024
      } else if ('[]/\\:.-_#$*=+~<>!@%&^'.includes(char)) {
        // Syntax delimiter: crisp surgical terminal snap
        const code = char.charCodeAt(0)
        clickFreq = 2500 + (code % 5) * 180
        bodyFreq = 180 + (code % 3) * 20
        clickQ = 2.8
        noiseAmp = 0.095
        bodyAmp = 0.035
        decay = 0.012
      } else if (char >= '0' && char <= '9') {
        // Cyber-dial digit: melodic numerical counter
        const digit = parseInt(char, 10)
        clickFreq = 1850 + digit * 80
        bodyFreq = 160 + digit * 5
        clickQ = 2.4
        noiseAmp = 0.090
        bodyAmp = 0.038
        decay = 0.014
      } else {
        // Alphabet letter: organic mechanical typewriter key with harmonic micro-steps
        const upper = char.toUpperCase()
        const cIdx = upper.charCodeAt(0) - 65
        const noteOffset = ((cIdx * 7) % 24)
        clickFreq = Math.round(1380 * Math.pow(2, noteOffset / 28))
        bodyFreq = 135 + ((cIdx * 3) % 45)
        const isVowel = 'AEIOUaeiou'.includes(char)
        clickQ = isVowel ? 1.8 : 2.5
        noiseAmp = isVowel ? 0.080 : 0.095
        bodyAmp = 0.040
        decay = 0.015
      }

      // Reverse erasure adjustment
      if (isReverse) {
        noiseAmp *= 0.55
        bodyAmp *= 0.5
        clickFreq = Math.round(clickFreq * 0.78)
        bodyFreq = Math.round(bodyFreq * 0.85)
      }

      // Master voice destination
      let destNode: AudioNode = this.uiGain || this.masterGain || this.ctx.destination

      // Spatial Stereo Pan across typing progression (left to right)
      if (this.ctx.createStereoPanner && options?.index !== undefined && options?.total && options.total > 1) {
        try {
          const posRatio = Math.max(0, Math.min(1, options.index / (options.total - 1)))
          const panVal = (posRatio - 0.5) * 0.44 // -0.22 (left) .. +0.22 (right)
          const panner = this.ctx.createStereoPanner()
          panner.pan.setValueAtTime(panVal, now)
          panner.connect(destNode)
          destNode = panner
        } catch (_) {}
      }

      // Layer 1: Switch Body / Bottom-out Resonance (sine thump)
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(bodyFreq, now)
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, bodyFreq * 0.6), now + decay)

      const oscGain = this.ctx.createGain()
      oscGain.gain.setValueAtTime(bodyAmp * intensity, now)
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + decay)

      osc.connect(oscGain)
      oscGain.connect(destNode)
      osc.start(now)
      osc.stop(now + decay + 0.005)

      // Layer 2: Click Leaf / Keycap Snap (bandpass filtered noise burst)
      if (this.sharedNoiseBuffer) {
        const source = this.ctx.createBufferSource()
        source.buffer = this.sharedNoiseBuffer

        const bp = this.ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.setValueAtTime(clickFreq, now)
        bp.Q.setValueAtTime(clickQ, now)

        const noiseGain = this.ctx.createGain()
        noiseGain.gain.setValueAtTime(noiseAmp * intensity, now)
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + decay)

        source.connect(bp)
        bp.connect(noiseGain)
        noiseGain.connect(destNode)

        source.start(now)
        source.stop(now + decay + 0.005)
      }
    } catch (_) {}
  }

  /**
   * Telemetry and specification tab tap.
   */
  public playSpecTab() {
    this.init()
    if (this.isMuted || !this.ctx) return

    if (this.playBuffer('telemetry_blip', this.uiGain, { volume: 0.25 })) {
      return
    }

    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(820, now)
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.035)

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.14, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035)

    osc.connect(gain)
    if (this.uiGain) gain.connect(this.uiGain)
    osc.start(now)
    osc.stop(now + 0.045)
  }

  /**
   * Transactional confirmation chime for add-to-cart actions.
   */
  public playCartAdd() {
    this.init()
    if (this.isMuted || !this.ctx) return

    // 1. Studio WAV buffer if loaded
    if (this.playBuffer('cart_add', this.uiGain, { volume: 0.35, pitchVariation: 0.015 })) {
      return
    }

    // 2. Procedural Fallback: Luxury Two-Tone Celesta Confirmation (F#5 -> C#6, perfect fifth resolution)
    const now = this.ctx.currentTime

    // Subtle tactile mechanical click
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.015)
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

      const source = this.ctx.createBufferSource()
      source.buffer = noiseBuffer

      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(1600, now)
      bp.Q.setValueAtTime(2.5, now)

      const clickGain = this.ctx.createGain()
      clickGain.gain.setValueAtTime(0.06, now)
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015)

      source.connect(bp)
      bp.connect(clickGain)
      if (this.uiGain) clickGain.connect(this.uiGain)
      source.start(now)
    } catch (_) {}

    // Subtle sub-bass thud (grounded feeling)
    const thud = this.ctx.createOscillator()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(140, now)
    thud.frequency.exponentialRampToValueAtTime(45, now + 0.04)

    const thudGain = this.ctx.createGain()
    thudGain.gain.setValueAtTime(0.12, now)
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)

    thud.connect(thudGain)
    if (this.uiGain) thudGain.connect(this.uiGain)
    thud.start(now)
    thud.stop(now + 0.05)

    // Two-tone chime: Tone 1 (740Hz, F#5), Tone 2 (1108Hz, C#6 at +0.08s)
    const tones = [
      { freq: 740.0, time: now + 0.005, vol: 0.18, dur: 0.42 },
      { freq: 1108.7, time: now + 0.085, vol: 0.22, dur: 0.52 },
    ]

    tones.forEach(({ freq, time, vol, dur }) => {
      if (!this.ctx) return

      // Pure crystalline fundamental
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, time)

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0.0001, time)
      gain.gain.exponentialRampToValueAtTime(vol, time + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur)

      osc.connect(gain)
      if (this.uiGain) gain.connect(this.uiGain)
      osc.start(time)
      osc.stop(time + dur + 0.01)

      // Metallic chime overtone (2.756x ratio for physical bell sparkle)
      const over = this.ctx.createOscillator()
      over.type = 'sine'
      over.frequency.setValueAtTime(freq * 2.756, time)

      const overGain = this.ctx.createGain()
      overGain.gain.setValueAtTime(0.0001, time)
      overGain.gain.exponentialRampToValueAtTime(vol * 0.22, time + 0.003)
      overGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12)

      over.connect(overGain)
      if (this.uiGain) overGain.connect(this.uiGain)
      over.start(time)
      over.stop(time + 0.13)
    })
  }

  /**
   * Airy celestial ambient atmosphere.
   */
  public startAmbient() {
    this.init()
    if (this.isMuted || !this.ctx || this.isAmbientPlaying) return

    try {
      // 1. Loopable studio WAV buffer if available (flawless 28-second seamless loop of floating chimes)
      const buffer = this.buffers.get('ambient_drone')
      if (buffer && this.ambientFilter) {
        this.ambientSource = this.ctx.createBufferSource()
        this.ambientSource.buffer = buffer
        this.ambientSource.loop = true

        this.ambientSource.connect(this.ambientFilter)

        this.ambientSource.start()
        this.isAmbientPlaying = true
        this.notify()
        return
      }

      // 2. Procedural Fallback: Generative Floating Chimes (spaced-out peaceful notes, zero hum)
      this.isAmbientPlaying = true
      this.notify()

      const pentatonicScale = [369.99, 415.30, 466.16, 554.37, 739.99]
      const playRandomChime = () => {
        if (!this.isAmbientPlaying || !this.ctx || this.isMuted) return
        try {
          const now = this.ctx.currentTime
          const freq = pentatonicScale[Math.floor(Math.random() * pentatonicScale.length)]
          const pan = (Math.random() * 2 - 1) * 0.3

          const osc = this.ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, now)

          const gain = this.ctx.createGain()
          gain.gain.setValueAtTime(0.001, now)
          gain.gain.exponentialRampToValueAtTime(0.045, now + 0.035)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 4.0)

          osc.connect(gain)

          const dest = this.ambientFilter || this.ambientGain
          if (this.ctx.createStereoPanner) {
            const panner = this.ctx.createStereoPanner()
            panner.pan.setValueAtTime(pan, now)
            gain.connect(panner)
            if (dest) panner.connect(dest)
          } else {
            if (dest) gain.connect(dest)
          }

          osc.start(now)
          osc.stop(now + 4.1)
        } catch (_) {}
      }

      // Play initial soft chime, then schedule next chimes every 3.5 - 5.5s
      playRandomChime()
      const scheduleNext = () => {
        if (!this.isAmbientPlaying) return
        const delay = 3500 + Math.random() * 2000
        this.ambientTimer = setTimeout(() => {
          playRandomChime()
          scheduleNext()
        }, delay)
      }
      scheduleNext()
    } catch (_) {}
  }

  public stopAmbient() {
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer)
      this.ambientTimer = null
    }
    if (this.ambientSource) {
      try {
        this.ambientSource.stop()
        this.ambientSource.disconnect()
      } catch (_) {}
      this.ambientSource = null
    }
    if (this.proceduralAmbientOscs.length) {
      this.proceduralAmbientOscs.forEach((osc) => {
        try {
          osc.stop()
          osc.disconnect()
        } catch (_) {}
      })
      this.proceduralAmbientOscs = []
    }
    this.isAmbientPlaying = false
    this.notify()
  }

  /**
   * Modulates ambient audio subtly with scene & motion progress,
   * plus physical acoustic occlusion during blade shutter transitions.
   * - In Scene 1: silenced (muted) at initial zero position (standby closeup plateau),
   *   smoothly emerging as the Steam Deck moves into Hero stance (p: 0 -> 0.18).
   * - During Blade Shutters (1 <-> 2): sound is dynamically muffled behind airtight carbon blades
   *   (cutoff smoothly sinks down to 320 Hz logarithmically, volume dips by 75%, warm resonant Q),
   *   then smoothly blooms back open when the shutter blades retract.
   */
  public updateAmbient(
    scene: number,
    scrollVelocity: number = 0,
    sceneProgress?: number,
    shutterPhaseOverride?: string
  ) {
    if (!this.ctx || !this.ambientFilter || !this.ambientGain || this.isMuted) return

    const now = this.ctx.currentTime
    const absVel = Math.min(1.0, Math.abs(scrollVelocity) * 1.5)

    let targetCutoff = 14000
    let targetVolume = 0.055

    // In Scene 1: silence ambient at initial zero position (standby),
    // then smoothly fade in as the Steam Deck moves away into Hero stance.
    let scene1MotionFactor = 1.0
    if (scene === 1 || scene === 0) {
      const currentProg = sceneProgress !== undefined
        ? sceneProgress
        : (typeof window !== 'undefined' && window.showcaseState?.offset !== undefined
          ? window.showcaseState.offset
          : 0.0)

      if (currentProg <= 0.015) {
        scene1MotionFactor = 0.0
      } else if (currentProg < 0.18) {
        const t = (currentProg - 0.015) / (0.18 - 0.015)
        scene1MotionFactor = t * t * (3 - 2 * t)
      } else {
        scene1MotionFactor = 1.0
      }
    }

    // Global ambient scale factor (calibrated for a warm, celestial presence at -26 LUFS)
    const AMBIENT_GLOBAL_SCALE = 0.95

    switch (scene) {
      case 0:
        targetCutoff = Math.round(350 + (8500 - 350) * scene1MotionFactor)
        targetVolume = 0.045 * AMBIENT_GLOBAL_SCALE * scene1MotionFactor
        break
      case 1:
        targetCutoff = Math.round(350 + (9000 - 350) * scene1MotionFactor)
        targetVolume = 0.055 * AMBIENT_GLOBAL_SCALE * scene1MotionFactor
        break
      case 2:
        targetCutoff = 8500
        targetVolume = 0.050 * AMBIENT_GLOBAL_SCALE
        break
      case 3:
      case 4:
        targetCutoff = 9500
        targetVolume = 0.065 * AMBIENT_GLOBAL_SCALE
        break
      case 5:
        targetCutoff = 8800
        targetVolume = 0.055 * AMBIENT_GLOBAL_SCALE
        break
    }

    targetCutoff = Math.min(10500, targetCutoff + absVel * 1000)

    // Shutter Occlusion Calculation (Airtight physical barrier muffling 1 <-> 2)
    const activePhase = (
      shutterPhaseOverride ||
      this.shutterPhase ||
      (typeof window !== 'undefined' && window.showcaseState?.shutterPhase) ||
      'idle'
    ) as 'idle' | 'closing' | 'closed' | 'opening' | 'darkroom'

    let shutterOcclusion = 0.0
    const SHUTTER_TRANSITION_MS = 1050

    if (activePhase === 'closing') {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsed = this.shutterPhaseStartTime > 0 ? Math.max(0, nowMs - this.shutterPhaseStartTime) : 0
      const t = Math.min(1.0, elapsed / SHUTTER_TRANSITION_MS)
      shutterOcclusion = t * t * (3 - 2 * t)
    } else if (activePhase === 'closed') {
      shutterOcclusion = 1.0
    } else if (activePhase === 'opening') {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsed = this.shutterPhaseStartTime > 0 ? Math.max(0, nowMs - this.shutterPhaseStartTime) : 0
      const t = Math.min(1.0, elapsed / SHUTTER_TRANSITION_MS)
      shutterOcclusion = 1.0 - (t * t * (3 - 2 * t))
    } else {
      shutterOcclusion = 0.0
    }

    if (shutterOcclusion > 0.001) {
      const occl = Math.max(0, Math.min(1.0, shutterOcclusion))
      const minCutoff = 320
      const currentCutoff = Math.max(minCutoff, targetCutoff)
      // Logarithmic cutoff frequency transition down to deep muffled bass (320 Hz)
      targetCutoff = Math.round(
        Math.exp((1 - occl) * Math.log(currentCutoff) + occl * Math.log(minCutoff))
      )
      // Physical sound attenuation: dampens by up to 75% behind the carbon door
      targetVolume = targetVolume * (1 - 0.75 * occl)
    }

    const targetQ = shutterOcclusion > 0.05 ? 0.707 + 1.4 * shutterOcclusion : 0.707
    const rampTime = shutterOcclusion > 0.001 ? 0.08 : 0.20

    this.ambientFilter.frequency.setTargetAtTime(Math.max(200, targetCutoff), now, rampTime)
    this.ambientFilter.Q.setTargetAtTime(targetQ, now, rampTime)
    this.ambientGain.gain.setTargetAtTime(Math.max(0.0001, targetVolume), now, rampTime)
    if (targetVolume <= 0.0001) {
      this.ambientGain.gain.setTargetAtTime(0, now + 0.05, 0.05)
    }
  }
}

// Global Singleton Export
export const soundManager = new SoundManager()

if (typeof window !== 'undefined') {
  window.soundManager = soundManager
}
