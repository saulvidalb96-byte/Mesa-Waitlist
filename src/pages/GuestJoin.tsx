import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { applyBrand } from "../App";
import { friendlyError, supabase } from "../lib/supabase";
import { toE164 } from "../lib/format";
import { Chips, Spinner } from "../components/ui";

interface Info { name: string; brand_color: string; open: boolean; waiting: number }

export default function GuestJoin() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState(2);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.rpc("get_join_info", { p_slug: slug }).then(({ data }) => {
      const i = (data as Info) || null;
      setInfo(i);
      if (i) { applyBrand(i.brand_color); document.title = `Join the waitlist · ${i.name}`; }
    });
  }, [slug]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!name.trim()) return setErr("Please enter your name.");
    const p = toE164(phone);
    if (!p || p === "invalid") return setErr("Please enter a 10-digit mobile number.");
    if (!agree) return setErr("Please agree to receive texts so we can tell you when your table is ready.");
    setBusy(true);
    const { data, error } = await supabase.rpc("guest_join", { p_slug: slug, p_name: name.trim(), p_phone: p, p_size: size });
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    nav(`/s/${data}`, { replace: true });
  }

  if (info === undefined) return <Spinner />;
  if (info === null) return <div className="page center"><div className="card"><h3>Waitlist not found</h3><p className="small">Please see the host stand.</p></div></div>;

  return (
    <>
      <div className="hero">
        <h1>{info.name}</h1>
        <p style={{ margin: "6px 0 0", opacity: .9 }}>
          {info.waiting === 0 ? "No wait right now" : `${info.waiting} ${info.waiting === 1 ? "party" : "parties"} waiting`}
        </p>
      </div>
      <div className="page">
        {!info.open ? (
          <div className="card center"><h3>Online check-in is closed</h3><p className="small">Please see the host stand to join the waitlist.</p></div>
        ) : (
          <form className="card" onSubmit={submit}>
            <h3>Join the waitlist</h3>
            <label className="f" htmlFor="gn">Name</label>
            <input id="gn" className="in" autoComplete="given-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
            <label className="f" htmlFor="gp">Mobile number</label>
            <input id="gp" className="in" type="tel" inputMode="tel" autoComplete="tel" placeholder="(360) 555-0123" value={phone} onChange={e => setPhone(e.target.value)} />
            <label className="f">Party size</label>
            <Chips options={[1, 2, 3, 4, 5, 6, 7]} value={size} onChange={setSize} />
            <p className="small">Larger group? Please see the host stand.</p>
            <label className="row small" style={{ marginTop: 14, alignItems: "flex-start" }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--brand)" }} />
              <span>Text me about my table from {info.name}. Up to 3 messages per visit. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
            </label>
            <div className="err">{err}</div>
            <button className="btn primary block" disabled={busy}>{busy ? "Adding you…" : "Join waitlist"}</button>
          </form>
        )}
      </div>
    </>
  );
}
