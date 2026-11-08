import { supabase } from "./supabase";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeader()), ...(init.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { code?: string };
    err.code = body?.code;
    throw err;
  }
  return body as T;
}

let smsEnabledCache: Promise<boolean> | null = null;
/** True once Twilio keys are set in Netlify. Cached for the session. */
export function smsEnabled(): Promise<boolean> {
  if (!smsEnabledCache) {
    smsEnabledCache = call<{ enabled: boolean }>("send-sms", { method: "GET" })
      .then(r => !!r.enabled)
      .catch(() => false);
  }
  return smsEnabledCache;
}

export const sendSms = (partyId: string, kind: "ready" | "added") =>
  call<{ ok: true }>("send-sms", { method: "POST", body: JSON.stringify({ partyId, kind }) });

export const addStaff = (businessId: string, email: string, password: string, role: string) =>
  call<{ ok: true; existing: boolean }>("invite-staff", {
    method: "POST",
    body: JSON.stringify({ businessId, email, password, role }),
  });
