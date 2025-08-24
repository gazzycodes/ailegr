import { createClient } from '@supabase/supabase-js'

// Sanitize env values to avoid hidden/control characters breaking fetch headers
const rawUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string
const rawKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string

const clean = (s?: string) => (s || '').toString().trim()
// Allow only url-safe base64 token characters and separators
const sanitizeKey = (s?: string) => clean(s).replace(/[^A-Za-z0-9._-]/g, '')

const supabaseUrl = clean(rawUrl)
const supabaseAnon = sanitizeKey(rawKey)

if (!supabaseUrl || !/^https?:\/\//i.test(supabaseUrl)) {
  console.error('[supabase] Invalid VITE_SUPABASE_URL env')
}
if (!supabaseAnon || supabaseAnon.length < 20) {
  console.error('[supabase] Invalid VITE_SUPABASE_ANON_KEY env')
}

export const supabase = createClient(supabaseUrl, supabaseAnon)

export default supabase
