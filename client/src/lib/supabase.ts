import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Video upload is not configured yet");
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
