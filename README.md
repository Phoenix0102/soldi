# Soldi

Web app personale per tracciare patrimonio, entrate e uscite, budget, obiettivi e spese ricorrenti, con un percorso di educazione finanziaria.

- **Stack:** React, TypeScript, Vite, Tailwind CSS, Recharts, Supabase
- **App installabile** (PWA) su telefono e computer
- **Pubblicazione:** GitHub Pages, automatica a ogni push su `main`

## Sviluppo

```bash
npm install
npm run dev
```

Le variabili in `.env` contengono solo l'URL del progetto Supabase e la chiave pubblica. I dati sono protetti dall'accesso con chiave e dalle regole RLS del database: solo l'utente proprietario può leggerli o modificarli.

## App iOS (Capacitor)

La stessa web app gira anche come app iOS nativa (`ios/`), con Face ID nativo e notifiche APNs.

- `npm run ios:sync` compila la versione nativa (`vite build --mode native`) e la copia nel progetto Xcode
- Non serve un Mac: a ogni push su `main` il workflow `ios.yml` compila, firma e carica l'app su **TestFlight** da un runner macOS di GitHub
- Segreti del repository: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (chiave API App Store Connect, ruolo Admin) e `APPLE_TEAM_ID`
- Notifiche: la chiave APNs (.p8) si inserisce in Impostazioni › Notifiche e resta sul server (`private.config`)
- Ritorno dalla banca nell'app: Enable Banking reindirizza a `banca.html` su GitHub Pages, che riapre l'app con `soldi://banca`
