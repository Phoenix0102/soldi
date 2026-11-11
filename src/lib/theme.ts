export type Theme = 'system' | 'light' | 'dark'
const KEY = 'soldi-theme'

export const getTheme = (): Theme => (localStorage.getItem(KEY) as Theme) || 'system'

export function applyTheme(t: Theme = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1512' : '#0F4D3A')
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t)
  applyTheme(t)
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())
