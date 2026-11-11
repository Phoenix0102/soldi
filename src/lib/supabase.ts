import { createClient } from '@supabase/supabase-js'

export const OWNER_EMAIL = 'owner@soldi.local'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'soldi-auth' } },
)
