// POST /api/invite-staff { businessId, email, password, role }
// Owner-only. Creates a login (or reuses an existing one) and adds it to the business.
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, caller, json, roleIn, UUID } from "../lib/shared";

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find(u => (u.email || "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export default async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const admin = adminClient();
  if (!admin) return json(500, { error: "Server is missing its Supabase settings." });
  const user = await caller(req, admin);
  if (!user) return json(401, { error: "Please sign in again." });

  let input: { businessId?: string; email?: string; password?: string; role?: string };
  try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const businessId = input.businessId || "";
  const email = (input.email || "").trim().toLowerCase();
  const password = input.password || "";
  const role = input.role === "manager" ? "manager" : "host";

  if (!UUID.test(businessId)) return json(400, { error: "Bad request" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid email." });
  if ((await roleIn(admin, businessId, user.id)) !== "owner") return json(403, { error: "Only the owner can add staff." });

  let userId: string | null = null;
  let existing = false;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created?.user) {
    userId = created.user.id;
  } else if (error && /already|registered|exists/i.test(error.message)) {
    userId = await findUserIdByEmail(admin, email);
    existing = true;
  } else if (error) {
    return json(400, { error: /password/i.test(error.message) ? "Password is too weak — try a longer one." : error.message });
  }
  if (!userId) return json(400, { error: "Couldn't find or create that account." });
  if (userId === user.id) return json(400, { error: "That's you — you're already the owner." });

  const { error: mErr } = await admin.from("members")
    .upsert({ business_id: businessId, user_id: userId, role, email }, { onConflict: "business_id,user_id" });
  if (mErr) return json(500, { error: "Couldn't add them — please try again." });
  return json(200, { ok: true, existing });
};
