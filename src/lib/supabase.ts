import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || "https://example.supabase.co", key || "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Turn a Supabase/Postgres error into a sentence a host can act on. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/duplicate key.*slug/i.test(msg)) return "That web address is taken — try another.";
  if (/invalid phone/i.test(msg)) return "That phone number doesn't look right — use 10 digits.";
  if (/Invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/check-in is closed/i.test(msg)) return "Online check-in is closed right now — please see the host.";
  if (/too many check-ins/i.test(msg)) return "We're very busy — please see the host to join the list.";
  if (/business limit/i.test(msg)) return "You've reached the limit of businesses on this account.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "No connection — check Wi-Fi and try again.";
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  return msg;
}
