import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { applyBrand } from "../App";
import { supabase } from "../lib/supabase";
import { fmtDur, minutesSince } from "../lib/format";
import { Spinner, useTick } from "../components/ui";

interface Status {
  business: string; brand_color: string; name: string; size: number;
  status: "waiting" | "notified" | "seated" | "cancelled" | "noshow";
  quote_min: number | null; added_at: string; position: number | null;
}

export default function GuestStatus() {
  const { token = "" } = useParams();
  const [s, setS] = useState<Status | null | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useTick(30000);

  const load = useCallback(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return setS(null);
    const { data, error } = await supabase.rpc("get_party_status", { p_token: token });
    if (error) return; // keep showing the last good state
    setS((data as Status) || null);
    if (data) { applyBrand((data as Status).brand_color); document.title = (data as Status).business; }
  }, [token]);

  useEffect(() => {
    load();
    const i = window.setInterval(load, 20000);
    const wake = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", wake);
    return () => { window.clearInterval(i); document.removeEventListener("visibilitychange", wake); };
  }, [load]);

  async function leave() {
    setLeaving(true);
    await supabase.rpc("guest_cancel", { p_token: token });
    await load();
    setLeaving(false); setConfirm(false);
  }

  if (s === undefined) return <Spinner />;
  if (s === null) return (
    <div className="page center"><div className="card"><h3>This link has expired</h3><p className="small">Please see the host stand.</p></div></div>
  );

  const waited = minutesSince(s.added_at);
  const left = s.quote_min != null ? Math.max(0, s.quote_min - waited) : null;

  return (
    <>
      <div className="hero">
        <h1>{s.business}</h1>
        <p style={{ margin: "6px 0 0", opacity: .9 }}>Hi {s.name} · party of {s.size}</p>
      </div>
      <div className="page center">
        {s.status === "waiting" && <>
          <p className="small" style={{ marginTop: 10 }}>YOUR PLACE IN LINE</p>
          <div className="big-num">#{s.position}</div>
          <p style={{ fontSize: 18 }}>
            {s.position === 1 ? "You're next!" : `${(s.position || 1) - 1} ${(s.position || 1) - 1 === 1 ? "party" : "parties"} ahead of you`}
          </p>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-around" }}>
              <div><b style={{ fontSize: 22 }}>{fmtDur(waited)}</b><div className="small">waiting so far</div></div>
              {left != null && <div><b style={{ fontSize: 22 }}>{left === 0 ? "Any minute" : `~${left}m`}</b><div className="small">estimated left</div></div>}
            </div>
          </div>
          <p className="small" style={{ marginTop: 16 }}>We'll text you when your table is ready. This page updates on its own.</p>
        </>}

        {s.status === "notified" && <>
          <div style={{ fontSize: 64, marginTop: 20 }}>🎉</div>
          <h2 style={{ margin: "8px 0" }}>Your table is ready!</h2>
          <p>Please head to the host stand now.</p>
        </>}
        {s.status === "seated" && <><div style={{ fontSize: 56, marginTop: 20 }}>🍽️</div><h2>You've been seated</h2><p>Enjoy your meal!</p></>}
        {(s.status === "cancelled" || s.status === "noshow") && <><h2 style={{ marginTop: 30 }}>You're off the waitlist</h2><p className="small">Changed your mind? Just see the host stand.</p></>}

        {(s.status === "waiting" || s.status === "notified") && (
          confirm ? (
            <div className="card">
              <p>Leave the waitlist?</p>
              <div className="foot" style={{ marginTop: 8 }}>
                <button className="btn ghost" onClick={() => setConfirm(false)}>Stay</button>
                <button className="btn danger" disabled={leaving} onClick={leave}>{leaving ? "Leaving…" : "Yes, leave"}</button>
              </div>
            </div>
          ) : <button className="linkish" style={{ marginTop: 24 }} onClick={() => setConfirm(true)}>Can't make it? Leave the waitlist</button>
        )}
      </div>
    </>
  );
}
