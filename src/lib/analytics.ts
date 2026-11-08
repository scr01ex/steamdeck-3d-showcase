import type { PostHogInterface } from 'posthog-js'

export type AnalyticsEventMap = {
  boot_power_on: {
    timestamp?: number
  }
  scene_change: {
    from_scene: number
    to_scene: number
    method?: 'scroll' | 'click' | 'gesture' | 'code' | string
  }
  scene_view: {
    scene: number
    previous_scene?: number
  }
  sound_toggle: {
    muted: boolean
    source?: string
  }
  cta_click: {
    button: string
    url?: string
    scene?: number
  }
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
    __posthogInstance?: unknown
  }
}

let isInitialized = false
let posthogInstance: PostHogInterface | null = null

export async function initAnalytics(): Promise<void> {
  if (typeof window === 'undefined' || isInitialized) return
  isInitialized = true

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'

  if (posthogKey) {
    try {
      const posthogModule = await import('posthog-js')
      const posthog = posthogModule.default

      posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
        session_recording: {
          captureCanvas: {
            recordCanvas: false, // Prevents readPixels pipeline stalls during 3D rendering
          },
          maskAllInputs: false,
        },
        loaded: (ph) => {
          posthogInstance = ph
          window.__posthogInstance = ph
        },
      })
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Analytics] Failed to initialize PostHog:', err)
      }
    }
  }
}

export function trackEvent<E extends keyof AnalyticsEventMap>(
  name: E,
  properties?: AnalyticsEventMap[E]
): void
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>
): void
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>
): void {
  try {
    if (typeof window === 'undefined') return

    if (posthogInstance) {
      posthogInstance.capture(name, properties)
    }

    if (typeof window.gtag === 'function') {
      window.gtag('event', name, properties)
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] ${name}`, properties ? properties : '')
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Analytics Error] Failed to track ${name}:`, err)
    }
  }
}
