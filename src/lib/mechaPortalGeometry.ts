export interface MechaPortalGeometry {
  cssPolygon: string
  svgPoints: string
  borderOpacity: number
  markOpacity: number
  cornerMarks: [number, number][]
}

export function computeMechaPortalGeometry(
  p: number,
  phase: 'opening' | 'closing' | 'idle',
  W: number,
  H: number
): MechaPortalGeometry {
  const cx = W / 2
  const cy = H / 2

  // Max card dimensions in the center before full bloom:
  const targetCardW = Math.min(W * 0.74, 960)
  const targetCardH = Math.min(H * 0.78, 640)

  let w = 0
  let h = 0
  let e2 = 0
  let bOp = 0

  const isClosing = phase === 'closing'

  if (isClosing) {
    const pSplit = 0.65
    const pCloseEnd = 0.02
    if (p <= pCloseEnd) {
      w = 0
      h = 0
      bOp = 0
      e2 = 0
    } else if (p <= pSplit) {
      // Phase 1 (closing): Mecha-Chassis collapses smoothly into central console slit and completely seals
      const u = (p - pCloseEnd) / (pSplit - pCloseEnd)
      // Smoothstep easing guarantees continuous velocity at pSplit (u=1) and zero-velocity seal at pCloseEnd (u=0)
      const easeT = u * u * (3 - 2 * u)
      w = easeT * targetCardW
      h = easeT * targetCardH
      // Smooth continuous fade-out: gently dissolves to 0 as the card seals into console center
      const s = Math.min(1, Math.max(0, u / 0.60))
      bOp = s * s * (3 - 2 * s)
      e2 = 0
    } else {
      // Phase 2 (closing): Starts right at visible screen perimeter (zero delay on click!),
      // smoothly contracting into card dimensions with matching continuous smoothstep speed
      const t = Math.min(1, Math.max(0, (p - pSplit) / (1.0 - pSplit)))
      e2 = t * t * (3 - 2 * t)
      w = targetCardW + e2 * (W * 1.02 - targetCardW)
      h = targetCardH + e2 * (H * 1.02 - targetCardH)
      // Smooth fade-in: outline not visible immediately at full screen, gently fades in as card contracts
      const s = Math.min(1, Math.max(0, (1 - e2) / 0.55))
      bOp = s * s * (3 - 2 * s)
    }
  } else {
    const pSplit = 0.65
    if (p <= pSplit) {
      // Phase 1 (opening): Crisp emergence from center into the Mecha-Chassis frame (matching continuous speed)
      const t = Math.max(0, p / pSplit)
      const easeT = 1 - Math.pow(1 - t, 2.8)
      w = easeT * targetCardW
      h = easeT * targetCardH
      // Smooth continuous fade-in: emerges gently from 0 opacity as the card emerges from the center
      const s = Math.min(1, Math.max(0, t / 0.60))
      bOp = s * s * (3 - 2 * s)
      e2 = 0
    } else {
      // Phase 2 (opening): Smoothstep expansion that blooms cleanly to screen boundaries
      const t = Math.min(1, Math.max(0, (p - pSplit) / (1.0 - pSplit)))
      e2 = t * t * (3 - 2 * t)
      w = targetCardW + e2 * (W * 1.02 - targetCardW)
      h = targetCardH + e2 * (H * 1.02 - targetCardH)
      const s = Math.min(1, Math.max(0, (1 - e2) / 0.55))
      bOp = s * s * (3 - 2 * s)
    }
  }

  const hw = w / 2
  const hh = h / 2

  // Adaptive features that gracefully flatten as the frame blooms past the screen
  const morphScale = 1 - e2
  const nw = Math.min(76, w * 0.12)
  const nd = Math.min(10, h * 0.024) * morphScale
  const c1 = Math.min(38, w * 0.08) * morphScale
  const c2 = Math.min(18, w * 0.04) * morphScale
  const sy = Math.min(14, h * 0.032) * morphScale
  const gp = Math.min(12, w * 0.02) * morphScale
  const gy = Math.min(28, h * 0.055)

  // Crosshair mark opacity: cleanly fades before card gets too small so crosshairs never overlap
  const markOpacity = Math.max(0, Math.min(1, (w - 60) / 140))

  // Vertices (Clockwise 26-point Stepped Mecha-Chassis):
  const pts: [number, number][] = [
    // Top edge & Notch
    [cx - hw + c1, cy - hh],
    [cx - nw, cy - hh],
    [cx - nw + 12, cy - hh + nd],
    [cx + nw - 12, cy - hh + nd],
    [cx + nw, cy - hh],
    [cx + hw - c1, cy - hh],

    // Top-Right Stepped Chamfer
    [cx + hw - c2, cy - hh + sy],
    [cx + hw, cy - hh + sy + c2],

    // Right Flank & Grip Peak
    [cx + hw, cy - gy],
    [cx + hw + gp, cy],
    [cx + hw, cy + gy],

    // Bottom-Right Stepped Chamfer
    [cx + hw, cy + hh - sy - c2],
    [cx + hw - c2, cy + hh - sy],
    [cx + hw - c1, cy + hh],

    // Bottom edge & Notch
    [cx + nw, cy + hh],
    [cx + nw - 12, cy + hh - nd],
    [cx - nw + 12, cy + hh - nd],
    [cx - nw, cy + hh],
    [cx - hw + c1, cy + hh],

    // Bottom-Left Stepped Chamfer
    [cx - hw + c2, cy + hh - sy],
    [cx - hw, cy + hh - sy - c2],

    // Left Flank & Grip Peak
    [cx - hw, cy + gy],
    [cx - hw - gp, cy],
    [cx - hw, cy - gy],

    // Top-Left Stepped Chamfer
    [cx - hw, cy - hh + sy + c2],
    [cx - hw + c2, cy - hh + sy],
  ]

  const cssPts = pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')
  const svgPts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const marks: [number, number][] = [
    [cx - hw + c1, cy - hh],
    [cx + hw - c1, cy - hh],
    [cx + hw - c1, cy + hh],
    [cx - hw + c1, cy + hh],
    [cx - hw - gp, cy],
    [cx + hw + gp, cy],
  ]

  return {
    cssPolygon: `polygon(${cssPts})`,
    svgPoints: svgPts,
    borderOpacity: bOp,
    markOpacity,
    cornerMarks: marks,
  }
}
