import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export function adminClient(): SupabaseClient | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .trim().replace(/\/+$/, "").replace(/\/(rest|auth|realtime|storage|functions)\/v1$/i, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The signed-in staff member making this request, from their Supabase token. */
export async function caller(req: Request, admin: SupabaseClient): Promise<User | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

export async function roleIn(admin: SupabaseClient, businessId: string, userId: string): Promise<string | null> {
  const { data } = await admin.from("members").select("role").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
  return (data?.role as string) || null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
