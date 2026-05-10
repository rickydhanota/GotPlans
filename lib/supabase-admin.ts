import { createClient } from "@supabase/supabase-js"

// Server-side Supabase client using the service role key. Bypasses RLS.
// Only use this in server components, route handlers, or server actions —
// never expose the service role key to the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
)
