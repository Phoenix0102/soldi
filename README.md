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
