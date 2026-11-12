/* Integrazione con l'app iOS (Capacitor). Nel browser queste funzioni non fanno nulla. */
import { Capacitor } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()

/** Indirizzo pubblico della web app, usato quando l'app nativa deve passare da una pagina web (ritorno dalla banca). */
export const WEB_URL = (import.meta.env.VITE_WEB_URL as string | undefined) ?? 'https://phoenix0102.github.io/soldi/'

/** Avvio dell'app nativa: barra di stato, splash e link in ingresso (soldi://…). */
export async function initNative() {
  if (!isNative()) return
  document.documentElement.dataset.native = 'ios'
  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/splash-screen'), import('@capacitor/status-bar'),
  ])

  // Testo della barra di stato chiaro su sfondi scuri (tema scuro, schermate di accesso), scuro altrimenti
  const root = document.documentElement
  const syncBar = () => {
    const lightText = root.classList.contains('dark') || root.dataset.statusbar === 'light'
    StatusBar.setStyle({ style: lightText ? Style.Dark : Style.Light }).catch(() => {})
  }
  syncBar()
  new MutationObserver(syncBar).observe(root, { attributes: true, attributeFilter: ['class', 'data-statusbar'] })

  // soldi://banca?code=…&state=… → ricarica l'app con i parametri, li gestisce useBankReturn
  const handle = (url: string) => {
    const u = new URL(url)
    const path = `/${u.host}${u.pathname}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
    if (path === '/banca') {
      location.href = `/${u.search}#/impostazioni`
    } else if (path === '/nuovo') {
      // Siri, widget, Centro di Controllo: apro il nuovo movimento, già compilato se c'è l'importo
      const amount = Number(u.searchParams.get('importo')) || undefined
      openQuickAdd({ amount, description: u.searchParams.get('descrizione') ?? undefined })
    } else {
      // soldi://patrimonio, soldi://movimenti… (widget, comandi rapidi)
      import('./navigate').then(({ navigateTo }) => navigateTo(path))
    }
  }
  App.addListener('appUrlOpen', ({ url }) => handle(url))
  App.getLaunchUrl().then((r) => { if (r?.url) handle(r.url) }).catch(() => {})

  setTimeout(() => SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}), 50)
}

/* Apertura del nuovo movimento da fuori (Siri, widget): se l'app non è ancora pronta, resta in attesa. */
type NewTx = { amount?: number; description?: string }
let pendingNew: NewTx | null = null
export function openQuickAdd(p: NewTx) {
  pendingNew = p
  window.dispatchEvent(new CustomEvent('soldi:new', { detail: p }))
}
export function takePendingQuickAdd() { const p = pendingNew; pendingNew = null; return p }
