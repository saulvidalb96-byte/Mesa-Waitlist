// POST /api/send-sms  { partyId, kind: "ready" | "added" }  → sends a text via Twilio
// GET  /api/send-sms                                         → { enabled } (are Twilio keys set?)
import { adminClient, caller, json, roleIn, UUID } from "../lib/shared";
import { fillTemplate, statusLink } from "../../src/lib/template";

const DAILY_LIMIT_PER_BUSINESS = 500;
const LIMIT_PER_PARTY = 5;

function twilioReady() {
  const e = process.env;
  return Boolean(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && (e.TWILIO_MESSAGING_SERVICE_SID || e.TWILIO_FROM_NUMBER));
}

function friendlyTwilio(code: number | undefined, message: string | undefined): string {
  switch (code) {
    case 21610: return "This guest replied STOP, so they can't be texted.";
    case 21211: case 21614: return "That number can't receive texts — double-check it.";
    case 21408: return "Texting to that country isn't turned on.";
    case 20003: return "Twilio login failed — check the Twilio keys in Netlify.";
    default: return message ? `Text failed: ${message}` : "Text failed — please try again.";
  }
}

export default async (req: Request) => {
  if (req.method === "GET") return json(200, { enabled: twilioReady() });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!twilioReady()) return json(503, { error: "Texting isn't set up yet.", code: "not_configured" });

  const admin = adminClient();
  if (!admin) return json(500, { error: "Server is missing its Supabase settings." });
  const user = await caller(req, admin);
  if (!user) return json(401, { error: "Please sign in again." });

  let input: { partyId?: string; kind?: string };
  try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const { partyId, kind } = input;
  if (!partyId || !UUID.test(partyId) || (kind !== "ready" && kind !== "added")) return json(400, { error: "Bad request" });

  const { data: party } = await admin.from("parties").select("*, businesses(*)").eq("id", partyId).maybeSingle();
  if (!party) return json(404, { error: "That party is no longer on the list." });
  if (!(await roleIn(admin, party.business_id, user.id))) return json(403, { error: "You don't have access to this waitlist." });
  if (!party.phone) return json(400, { error: "This party has no phone number." });

  const since = new Date(Date.now() - 86400000).toISOString();
  const [{ count: dayCount }, { count: partyCount }] = await Promise.all([
    admin.from("messages").select("id", { count: "exact", head: true }).eq("business_id", party.business_id).gte("created_at", since),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("party_id", party.id).eq("status", "sent"),
  ]);
  if ((dayCount ?? 0) >= DAILY_LIMIT_PER_BUSINESS) return json(429, { error: "Daily text limit reached." });
  if ((partyCount ?? 0) >= LIMIT_PER_PARTY) return json(429, { error: "This guest has already been texted 5 times." });

  const biz = party.businesses as { name: string; sms_ready: string; sms_added: string };
  const origin = process.env.URL || new URL(req.url).origin;
  const body = fillTemplate(kind === "ready" ? biz.sms_ready : biz.sms_added, {
    name: party.name, business: biz.name, wait: party.quote_min, link: statusLink(origin, party.public_token),
  });

  const { data: priv } = await admin.from("business_private").select("sms_from").eq("business_id", party.business_id).maybeSingle();
  const e = process.env;
  const params = new URLSearchParams({ To: party.phone, Body: body });
  if (priv?.sms_from) params.set("From", priv.sms_from);
  else if (e.TWILIO_MESSAGING_SERVICE_SID) params.set("MessagingServiceSid", e.TWILIO_MESSAGING_SERVICE_SID);
  else params.set("From", e.TWILIO_FROM_NUMBER!);

  let ok = false, sid: string | undefined, errMsg: string | undefined;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const tw = (await r.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
    ok = r.ok; sid = tw.sid;
    if (!ok) errMsg = friendlyTwilio(tw.code, tw.message);
  } catch {
    errMsg = "Couldn't reach Twilio — please try again.";
  }

  await admin.from("messages").insert({
    business_id: party.business_id, party_id: party.id, to_phone: party.phone, body, kind,
    status: ok ? "sent" : "failed", provider_id: sid ?? null, error: errMsg ?? null, sent_by: user.id,
  });
  if (!ok) return json(502, { error: errMsg });

  if (kind === "ready") {
    await admin.from("parties").update({ status: "notified", notified_at: new Date().toISOString() })
      .eq("id", party.id).in("status", ["waiting", "notified"]);
  }
  return json(200, { ok: true });
};
