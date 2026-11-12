import { createContext, useContext } from 'react'

/** Vero dentro una scheda del pager: lì lo swipe orizzontale serve a cambiare scheda. */
export const InPagerCtx = createContext(false)
export const useInPager = () => useContext(InPagerCtx)
