/**
 * Geometry transformation utilities for Portal and Shutter clip-paths
 */

export function convertViewportPolygonToLocal(polygonStr: string, left: number, top: number): string {
  if (!polygonStr || polygonStr === 'none') return 'none'
  if (polygonStr.includes('%') || isNaN(left) || isNaN(top)) return 'polygon(0px 0px, 0px 0px)'
  return polygonStr.replace(/([-\d.]+)px\s+([-\d.]+)px/g, (_, xStr, yStr) => {
    const x = parseFloat(xStr) - left
    const y = parseFloat(yStr) - top
    return `${x.toFixed(1)}px ${y.toFixed(1)}px`
  })
}
