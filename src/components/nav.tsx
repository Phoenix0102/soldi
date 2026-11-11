import { forwardRef, useCallback } from 'react'
import {
  Link as RLink, NavLink as RNavLink, useLocation, useNavigate,
  type LinkProps, type NavLinkProps, type NavigateOptions, type To,
} from 'react-router-dom'
import { directionFor, setDirection } from '../lib/motion'

const toPath = (to: To) => (typeof to === 'string' ? to : to.pathname ?? '/')

/** Link con transizione animata e direzione calcolata. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, onClick, ...rest }, ref) {
  const { pathname } = useLocation()
  return (
    <RLink ref={ref} to={to} viewTransition
      onClick={(e) => { setDirection(directionFor(pathname, toPath(to))); onClick?.(e) }} {...rest} />
  )
})

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ to, onClick, ...rest }, ref) {
  const { pathname } = useLocation()
  return (
    <RNavLink ref={ref} to={to} viewTransition
      onClick={(e) => { setDirection(directionFor(pathname, toPath(to))); onClick?.(e) }} {...rest} />
  )
})

/** navigate() con transizione animata. */
export function useGo() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return useCallback((to: To | number, opts?: NavigateOptions) => {
    if (typeof to === 'number') { setDirection('back'); navigate(to); return }
    setDirection(directionFor(pathname, toPath(to)))
    navigate(to, { viewTransition: true, ...opts })
  }, [navigate, pathname])
}
