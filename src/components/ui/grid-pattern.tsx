'use client'

import React, { useId } from 'react'
import { cn } from '@/lib/utils'

export interface GridPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  x?: number
  y?: number
  squares?: Array<[x: number, y: number]>
  strokeDasharray?: string
  className?: string
  squareClassName?: string
  variant?: 'default' | 'small' | 'large'
}

const variantStyles = {
  default: {
    width: 36,
    height: 36,
    className: 'stroke-white/[0.07]',
  },
  small: {
    width: 16,
    height: 16,
    className: 'stroke-white/[0.05]',
  },
  large: {
    width: 64,
    height: 64,
    className: 'stroke-white/[0.09]',
  },
}

const getPatternPath = (variant: string, width: number, height: number) => {
  switch (variant) {
    default:
      return `M.5 ${height}V.5H${width}`
  }
}

export function GridPattern({
  width,
  height,
  x = -1,
  y = -1,
  strokeDasharray = '0',
  squares,
  className,
  squareClassName = 'fill-white/[0.04]',
  variant = 'default',
  ...props
}: GridPatternProps) {
  const id = useId()

  const variantConfig = variantStyles[variant] || variantStyles.default
  const finalWidth = width ?? variantConfig.width
  const finalHeight = height ?? variantConfig.height
  const finalClassName = cn(
    'pointer-events-none absolute inset-0 h-full w-full',
    variantConfig.className,
    className
  )

  return (
    <svg aria-hidden="true" className={finalClassName} {...props}>
      <defs>
        <pattern
          id={id}
          width={finalWidth}
          height={finalHeight}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={getPatternPath(variant, finalWidth, finalHeight)}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
      {squares && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([sqX, sqY]) => (
            <rect
              className={cn('transition-all duration-500', squareClassName)}
              strokeWidth="0"
              key={`${sqX}-${sqY}`}
              width={finalWidth - 1}
              height={finalHeight - 1}
              x={sqX * finalWidth + 1}
              y={sqY * finalHeight + 1}
            />
          ))}
        </svg>
      )}
    </svg>
  )
}
