import { useCallback } from 'react'
import { Link as RLink, NavLink as RNavLink, useNavigate, type NavigateOptions, type To } from 'react-router-dom'

/* Link e NavLink restano quelli di React Router: le animazioni le gestisce il Layout. */
export const Link = RLink
export const NavLink = RNavLink

/** navigate() con numero (indietro) o destinazione. */
export function useGo() {
  const navigate = useNavigate()
  return useCallback((to: To | number, opts?: NavigateOptions) => {
    if (typeof to === 'number') navigate(to)
    else navigate(to, opts)
  }, [navigate])
}
