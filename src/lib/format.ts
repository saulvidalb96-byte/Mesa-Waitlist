export const digits = (s: string | null | undefined) => String(s || "").replace(/\D/g, "");

/** "+13605551234" or "3605551234" → "(360) 555-1234" */
export function fmtPhone(p: string | null | undefined): string {
  let d = digits(p);
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || "";
}

/** Browser-side check that matches the database's normalize_phone. */
export function toE164(p: string): string | null {
  const d = digits(p);
  if (!d) return null;
  if (d.length === 10) return "+1" + d;
  if (d.length >= 11 && d.length <= 15) return "+" + d;
  return "invalid";
}

export const minutesSince = (iso: string | null, now = Date.now()) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0;

export const fmtDur = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

export const fmtClock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

export function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);

export const smsHref = (phone: string, body: string) =>
  `sms:${phone}${isIOS() ? "&" : "?"}body=${encodeURIComponent(body)}`;
