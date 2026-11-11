import { useMemo } from 'react'

/** Rosone in stile incisione da banconota: curve epitrocoidi sovrapposte. */
export function Guilloche({ className = '', stroke = 'currentColor' }: { className?: string; stroke?: string }) {
  const paths = useMemo(() => {
    const make = (R: number, r: number, d: number, steps = 1400) => {
      let s = ''
      const turns = r / gcd(R, r)
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2 * turns
        const x = (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t)
        const y = (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t)
        s += `${i ? 'L' : 'M'}${(x + 300).toFixed(1)},${(y + 300).toFixed(1)}`
      }
      return s
    }
    return [make(170, 10, 60), make(150, 12, 72), make(130, 7, 52), make(110, 9, 40)]
  }, [])
  return (
    <svg viewBox="0 0 600 600" className={`guilloche ${className}`} aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} pathLength={1} fill="none" stroke={stroke} strokeWidth={0.7} opacity={0.55 - i * 0.08} />
      ))}
    </svg>
  )
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a }
