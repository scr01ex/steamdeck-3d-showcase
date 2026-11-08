/**
 * Navigation hit-testing and DOM utilities for HUD Header and Mobile Dock.
 */

export const isMouseOverNavTab = (
  tabId: number,
  mousePos: { x: number; y: number } | null,
  allowInactiveHeader: boolean = false
): boolean => {
  if (!mousePos || typeof document === 'undefined') return false
  const { x, y } = mousePos

  const matchTab = (el: HTMLElement) => {
    const d = el.getAttribute('data-nav-tab')
    if (d) return d === String(tabId)
    const aria = el.getAttribute('aria-label') || ''
    const text = el.textContent || ''
    if (tabId === 1) return aria.includes('01') || text.includes('01') || text.includes('OVR') || text.includes('OVERVIEW')
    if (tabId === 2) return aria.includes('02') || text.includes('02') || text.includes('OLED') || text.includes('DISPLAY')
    if (tabId === 3) return aria.includes('03') || text.includes('03') || text.includes('LIB') || text.includes('LIBRARY')
    if (tabId === 5) return aria.includes('04') || aria.includes('05') || text.includes('04') || text.includes('PERF') || text.includes('SPECS') || text.includes('PERFORMANCE')
    return false
  }

  // Mobile HUD Dock check
  const mobileDock = document.querySelector('.hud-mobile-dock')
  if (mobileDock) {
    const dockRect = mobileDock.getBoundingClientRect()
    if (
      x >= dockRect.left - 2 && x <= dockRect.right + 2 &&
      y >= dockRect.top - 2 && y <= dockRect.bottom + 2
    ) {
      const buttons = mobileDock.querySelectorAll<HTMLElement>('.hud-link-hover, button')
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i]
        if (matchTab(btn)) {
          const rect = btn.getBoundingClientRect()
          if (
            x >= rect.left - 1 && x <= rect.right + 1 &&
            y >= rect.top - 1 && y <= rect.bottom + 1
          ) {
            return true
          }
        }
      }
    }
  }

  // Desktop Header Bar check
  const headers = document.querySelectorAll<HTMLElement>('header')
  for (let h = 0; h < headers.length; h++) {
    const header = headers[h]
    if (!allowInactiveHeader && (header.style.visibility === 'hidden' || header.style.opacity === '0' || header.style.pointerEvents === 'none')) continue
    const buttons = header.querySelectorAll<HTMLElement>('.hud-link-hover, button')
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i]
      if (matchTab(btn)) {
        const rect = btn.getBoundingClientRect()
        const top = allowInactiveHeader ? 0 : rect.top - 1
        const bottom = allowInactiveHeader ? 64 : rect.bottom + 1
        if (
          x >= rect.left - 1 && x <= rect.right + 1 &&
          y >= top && y <= bottom
        ) {
          return true
        }
      }
    }
  }

  return false
}
