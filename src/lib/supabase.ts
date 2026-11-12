import { createClient } from "@supabase/supabase-js";

const rawUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || "").trim().replace(/\/+$/, "");
const key = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "").trim();

/** Why the site can't connect, in plain words — or "" when everything looks right. */
export const configProblem: string = (() => {
  if (!rawUrl) return "VITE_SUPABASE_URL is missing.";
  if (!key) return "VITE_SUPABASE_ANON_KEY is missing.";
  let u: URL;
  try { u = new URL(rawUrl); } catch { return `VITE_SUPABASE_URL isn't a web address: "${rawUrl.slice(0, 60)}". It should look like https://abcd1234.supabase.co`; }
  if (u.protocol !== "https:") return "VITE_SUPABASE_URL must start with https://";
  if (/supabase\.com$/i.test(u.hostname)) return "VITE_SUPABASE_URL is the dashboard address. Use the Project URL instead, which looks like https://abcd1234.supabase.co";
  if (u.pathname !== "/" && u.pathname !== "") return `VITE_SUPABASE_URL has extra text after the address ("${u.pathname}"). Use just https://${u.hostname}`;
  if (/^sb_secret_/i.test(key) || /service_role/i.test(key)) return "VITE_SUPABASE_ANON_KEY is the SECRET key. Use the Publishable key (sb_publishable_…) here, and rotate the secret key in Supabase since it was exposed.";
  return "";
})();

export const configured = configProblem === "";

export const supabase = createClient(
  configured ? rawUrl : "https://example.supabase.co",
  configured ? key : "missing-key",
  { auth: { persistSession: true, autoRefreshToken: true } }
);

/** Turn a Supabase/Postgres error into a sentence a host can act on. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/duplicate key.*slug/i.test(msg)) return "That web address is taken — try another.";
  if (/invalid phone/i.test(msg)) return "That phone number doesn't look right — use 10 digits.";
  if (/Invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox for the link.";
  if (/check-in is closed/i.test(msg)) return "Online check-in is closed right now — please see the host.";
  if (/too many check-ins/i.test(msg)) return "We're very busy — please see the host to join the list.";
  if (/business limit/i.test(msg)) return "You've reached the limit of businesses on this account.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "No connection — check Wi-Fi and try again.";
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/function .* does not exist|Could not find the function/i.test(msg)) return "The database isn't set up yet — run schema.sql in Supabase's SQL Editor.";
  return msg;
}
