import { FormEvent, useState } from "react";
import { friendlyError, supabase } from "../lib/supabase";
import { slugify } from "../lib/format";
import { APP_NAME } from "../App";

export default function Onboarding({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const s = slugTouched ? slug : slugify(name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Enter your business name.");
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s)) return setErr("Web name: 3–40 lowercase letters, numbers or dashes.");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_business", { p_name: name.trim(), p_slug: s });
    if (error) { setBusy(false); return setErr(friendlyError(error)); }
    await onCreated((data as { id: string }).id);
  }

  return (
    <div className="page">
      <div className="logo">{APP_NAME}</div>
      <form className="card" onSubmit={submit}>
        <h3>Set up your business</h3>
        <p className="small">You'll be the owner. You can add staff and change colors and messages after this.</p>
        <label className="f" htmlFor="bn">Business name</label>
        <input id="bn" className="in" placeholder="Canela Brunch & Cocktails" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        <label className="f" htmlFor="bs">Web name</label>
        <input id="bs" className="in" value={s} onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
        <p className="small">Guests check in at <b>{location.host}/join/{s || "your-name"}</b></p>
        <div className="err">{err}</div>
        <button className="btn primary block" disabled={busy}>{busy ? "Creating…" : "Create business"}</button>
      </form>
      <p className="small center" style={{ marginTop: 16 }}>
        Joining an existing team? Ask the owner to add your email in their Settings, then sign out and back in.<br />
        <button className="linkish" style={{ marginTop: 10 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </p>
    </div>
  );
}
