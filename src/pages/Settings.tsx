import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { applyBrand, APP_NAME, useBiz } from "../App";
import { friendlyError, supabase } from "../lib/supabase";
import { addStaff } from "../lib/api";
import type { Member, Role } from "../lib/types";
import { Chips, useToast } from "../components/ui";

export default function Settings() {
  const { business, role, memberships, switchTo, reload, session } = useBiz();
  const toast = useToast();
  const isManager = role === "owner" || role === "manager";

  /* ---------- business + messages ---------- */
  const [name, setName] = useState(business.name);
  const [color, setColor] = useState(business.brand_color);
  const [ready, setReady] = useState(business.sms_ready);
  const [added, setAdded] = useState(business.sms_added);
  const [seats, setSeats] = useState(business.seat_options.join(", "));
  const [quotes, setQuotes] = useState(business.quote_options.join(", "));
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const quoteList = quotes.split(",").map(s => parseInt(s.trim())).filter(n => n >= 0 && n <= 600);
    const seatList = seats.split(",").map(s => s.trim()).filter(Boolean).slice(0, 12);
    setSaving(true);
    const { error } = await supabase.from("businesses").update({
      name: name.trim(), brand_color: color, sms_ready: ready.trim(), sms_added: added.trim(),
      seat_options: seatList, quote_options: quoteList.length ? quoteList : [5, 10, 15, 20, 30, 45, 60],
    }).eq("id", business.id);
    setSaving(false);
    if (error) return toast(friendlyError(error));
    applyBrand(color);
    await reload();
    toast("Settings saved");
  }

  /* ---------- self check-in ---------- */
  const joinUrl = `${location.origin}/join/${business.slug}`;
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(joinUrl, { width: 600, margin: 1, color: { dark: "#2B1A12" } }).then(setQr); }, [joinUrl]);
  async function toggleCheckin(on: boolean) {
    const { error } = await supabase.from("businesses").update({ self_checkin: on }).eq("id", business.id);
    if (error) return toast(friendlyError(error));
    await reload();
    toast(on ? "Guests can now join from the QR code" : "QR check-in turned off");
  }

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link to="/" className="btn ghost">← Waitlist</Link>
        <span className="small">{APP_NAME}</span>
      </div>

      {memberships.length > 1 && (
        <div className="card">
          <h3>Business</h3>
          <Chips options={memberships.map(m => m.businesses.name)} value={business.name}
            onChange={n => { const m = memberships.find(x => x.businesses.name === n); if (m) switchTo(m.business_id); }} />
        </div>
      )}

      {isManager ? (
        <form className="card" onSubmit={save}>
          <h3>Your business</h3>
          <label className="f" htmlFor="bn">Name</label>
          <input id="bn" className="in" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
          <label className="f" htmlFor="bc">Brand color</label>
          <div className="row">
            <input id="bc" type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 56, height: 46, border: "none", background: "none" }} />
            <input className="in" value={color} onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setColor(e.target.value)} />
          </div>

          <label className="f" htmlFor="sr">"Table ready" text</label>
          <textarea id="sr" className="in" maxLength={320} value={ready} onChange={e => setReady(e.target.value)} />
          <label className="f" htmlFor="sa">"You're on the list" text</label>
          <textarea id="sa" className="in" maxLength={320} value={added} onChange={e => setAdded(e.target.value)} />
          <p className="small">Fill-ins: <b>{"{name}"}</b> guest's first name · <b>{"{business}"}</b> · <b>{"{wait}"}</b> quoted minutes · <b>{"{link}"}</b> their live spot-in-line page.</p>

          <label className="f" htmlFor="so">Seating options</label>
          <input id="so" className="in" value={seats} onChange={e => setSeats(e.target.value)} />
          <label className="f" htmlFor="qo">Quote buttons (minutes)</label>
          <input id="qo" className="in" inputMode="numeric" value={quotes} onChange={e => setQuotes(e.target.value)} />
          <p className="small">Separate with commas.</p>
          <button className="btn primary block" style={{ marginTop: 14 }} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </form>
      ) : (
        <div className="card"><h3>{business.name}</h3><p className="small">You're signed in as host. A manager can change settings.</p></div>
      )}

      {isManager && (
        <div className="card">
          <h3>QR code check-in</h3>
          <p className="small">Print this by the door. Guests scan it, add themselves, and get a page showing their spot in line.</p>
          <label className="switch" style={{ marginTop: 10 }}>
            <span><b>Let guests add themselves</b></span>
            <input type="checkbox" checked={business.self_checkin} onChange={e => toggleCheckin(e.target.checked)} />
          </label>
          {qr && <img className="qr" src={qr} alt="QR code for guest check-in" />}
          <p className="small center" style={{ wordBreak: "break-all" }}>{joinUrl}</p>
          {qr && <a className="btn ghost block" href={qr} download={`${business.slug}-waitlist-qr.png`}>⬇︎ Download QR code</a>}
        </div>
      )}

      {role === "owner" && <Staff businessId={business.id} me={session.user.id} />}

      <Account email={session.user.email || ""} />
    </div>
  );
}

/* ---------- staff ---------- */
function Staff({ businessId, me }: { businessId: string; me: string }) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>("host");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data } = await supabase.from("members").select("*").eq("business_id", businessId).order("created_at");
    setMembers((data || []) as Member[]);
  };
  useEffect(() => { load(); }, [businessId]);

  async function add(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr("Password needs at least 8 characters.");
    setBusy(true);
    try {
      const r = await addStaff(businessId, email.trim().toLowerCase(), pw, role);
      toast(r.existing ? "Added — they can sign in with their existing password" : "Staff login created");
      setEmail(""); setPw("");
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function removeMember(m: Member) {
    const { error } = await supabase.from("members").delete().eq("business_id", businessId).eq("user_id", m.user_id);
    if (error) return toast(friendlyError(error));
    load(); toast("Removed");
  }

  return (
    <div className="card">
      <h3>Staff</h3>
      <p className="small">Make one login for the host-stand iPad, or one per person. Hosts run the list; managers can also change settings.</p>
      <div style={{ marginTop: 8 }}>
        {members.map(m => (
          <div className="member" key={m.user_id}>
            <div><div style={{ fontWeight: 600 }}>{m.email || "Staff"}</div><div className="small">{m.role}{m.user_id === me ? " · you" : ""}</div></div>
            {m.user_id !== me && <button className="btn danger" style={{ padding: "8px 12px" }} onClick={() => removeMember(m)}>Remove</button>}
          </div>
        ))}
      </div>
      <form onSubmit={add}>
        <label className="f" htmlFor="se">Add staff email</label>
        <input id="se" className="in" type="email" required placeholder="hoststand@canelabrunch.com" value={email} onChange={e => setEmail(e.target.value)} />
        <label className="f" htmlFor="sp">Their password</label>
        <input id="sp" className="in" type="text" autoComplete="off" required minLength={8} value={pw} onChange={e => setPw(e.target.value)} />
        <p className="small">Ignored if they already have an account. Share it with them in person.</p>
        <label className="f">Role</label>
        <Chips options={["host", "manager"] as Role[]} value={role} onChange={setRole} />
        <div className="err">{err}</div>
        <button className="btn primary block" disabled={busy}>{busy ? "Adding…" : "Add staff"}</button>
      </form>
    </div>
  );
}

/* ---------- my account ---------- */
function Account({ email }: { email: string }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  async function change(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast("Use at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast(friendlyError(error));
    setPw(""); toast("Password updated");
  }
  return (
    <form className="card" id="password" onSubmit={change}>
      <h3>My account</h3>
      <p className="small">Signed in as {email}</p>
      <label className="f" htmlFor="np">New password</label>
      <input id="np" className="in" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
      <button className="btn ghost block" style={{ marginTop: 10 }}>Change password</button>
      <button type="button" className="btn danger block" style={{ marginTop: 10 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
    </form>
  );
}
