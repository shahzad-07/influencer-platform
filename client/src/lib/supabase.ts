import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Video upload is not configured yet");
  }
  if (!client) {
    client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
