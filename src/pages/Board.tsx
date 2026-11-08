import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBiz } from "../App";
import { friendlyError, supabase } from "../lib/supabase";
import type { Party, Status } from "../lib/types";
import { isActive } from "../lib/types";
import { fmtDur, fmtPhone, startOfTodayISO } from "../lib/format";
import { PartyCard, PartyForm, PartyInput, TextSheet } from "../components/party";
import { Sheet, Spinner, useTick, useToast } from "../components/ui";

type Tab = "active" | "seated" | "removed";

export default function Board() {
  const { business, role } = useBiz();
  const toast = useToast();
  useTick(30000);

  const [parties, setParties] = useState<Party[] | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [live, setLive] = useState(true);
  const [form, setForm] = useState<{ party: Party | null } | null>(null);
  const [menu, setMenu] = useState<Party | null>(null);
  const [text, setText] = useState<{ party: Party; kind: "ready" | "added" } | null>(null);
  const canWrite = true; // every staff role can run the board
  const canDelete = role === "owner" || role === "manager";

  /* ---------- data ---------- */
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("parties").select("*")
      .eq("business_id", business.id)
      .or(`status.in.(waiting,notified),added_at.gte.${startOfTodayISO()}`)
      .order("added_at");
    if (!error) setParties(data as Party[]);
  }, [business.id]);

  const upsertLocal = (row: Party) =>
    setParties(ps => {
      if (!ps) return [row];
      const i = ps.findIndex(p => p.id === row.id);
      if (i < 0) return [...ps, row];
      const next = ps.slice(); next[i] = row; return next;
    });

  useEffect(() => {
    setParties(null);
    load();
    const ch = supabase
      .channel(`parties-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "parties", filter: `business_id=eq.${business.id}` },
        payload => {
          if (payload.eventType === "DELETE") setParties(ps => ps?.filter(p => p.id !== (payload.old as Party).id) || ps);
          else upsertLocal(payload.new as Party);
        })
      .subscribe(status => {
        if (status === "SUBSCRIBED") { setLive(true); load(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive(false);
      });
    // Safety net: refresh when the iPad wakes up and every minute.
    const onWake = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", load);
    const poll = window.setInterval(load, 60000);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", load);
      window.clearInterval(poll);
    };
  }, [business.id, load]);

  async function update(p: Party, patch: Partial<Party>, msg?: string) {
    const { data, error } = await supabase.from("parties").update(patch).eq("id", p.id).select().single();
    if (error) { toast(friendlyError(error)); return false; }
    upsertLocal(data as Party);
    if (msg) toast(msg);
    return true;
  }

  async function add(v: PartyInput) {
    const { data, error } = await supabase.from("parties").insert({ ...v, business_id: business.id }).select().single();
    if (error) { toast(friendlyError(error)); return false; }
    upsertLocal(data as Party);
    toast(`${v.name} added · party of ${v.size}`);
    return true;
  }

  async function remove(p: Party) {
    const { error } = await supabase.from("parties").delete().eq("id", p.id);
    if (error) return toast(friendlyError(error));
    setParties(ps => ps?.filter(x => x.id !== p.id) || ps);
    toast("Deleted");
  }

  /* ---------- views ---------- */
  const today = startOfTodayISO();
  const { active, seated, removed, avgWait, guests } = useMemo(() => {
    const ps = parties || [];
    const active = ps.filter(isActive).sort((a, b) => a.added_at.localeCompare(b.added_at));
    const seated = ps.filter(p => p.status === "seated" && (p.seated_at || "") >= today).sort((a, b) => (b.seated_at || "").localeCompare(a.seated_at || ""));
    const removed = ps.filter(p => (p.status === "cancelled" || p.status === "noshow") && (p.removed_at || p.added_at) >= today)
      .sort((a, b) => (b.removed_at || "").localeCompare(a.removed_at || ""));
    const waits = seated.map(p => (new Date(p.seated_at!).getTime() - new Date(p.added_at).getTime()) / 60000);
    const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
    const guests = active.reduce((n, p) => n + p.size, 0);
    return { active, seated, removed, avgWait, guests };
  }, [parties, today]);

  const rows = tab === "active" ? active : tab === "seated" ? seated : removed;
  const label = (t: Tab, n: number) => ({ active: "Waiting", seated: "Seated", removed: "Removed" }[t] + (n ? ` (${n})` : ""));

  return (
    <>
      <header className="top">
        <div className="top-row">
          <div>
            <h1>{business.name}</h1>
            <small>Waitlist · {new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</small>
          </div>
          <Link to="/settings" className="icon-btn" aria-label="Settings">⚙︎</Link>
        </div>
        <div className="stats">
          <div className="stat"><b>{active.length}</b><span>Parties waiting</span></div>
          <div className="stat"><b>{guests}</b><span>Guests waiting</span></div>
          <div className="stat"><b>{avgWait == null ? "–" : fmtDur(avgWait)}</b><span>Avg wait today</span></div>
        </div>
      </header>

      {!live && <div className="banner">Reconnecting… the list refreshes every minute until it's back.</div>}

      <div className="tabs">
        {(["active", "seated", "removed"] as Tab[]).map(t => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label(t, t === "active" ? active.length : t === "seated" ? seated.length : removed.length)}
          </button>
        ))}
      </div>

      <main className="wrap">
        {!parties ? <Spinner /> : rows.length === 0 ? (
          tab === "active"
            ? <div className="empty"><div className="big">No one's waiting</div>Tap <b>Add party</b> when guests arrive.</div>
            : <div className="empty">Nothing here yet today.</div>
        ) : (
          <div className="list">
            {rows.map((p, i) => (
              <PartyCard key={p.id} p={p} index={i} canWrite={canWrite}
                onText={() => setText({ party: p, kind: "ready" })}
                onSeat={() => update(p, { status: "seated" }, `${p.name} seated`)}
                onRestore={() => update(p, { status: "waiting" as Status }, `${p.name} is back on the list`).then(ok => ok && setTab("active"))}
                onMenu={() => setMenu(p)} />
            ))}
          </div>
        )}
      </main>

      {canWrite && <button className="fab" onClick={() => setForm({ party: null })}><span>+</span> Add party</button>}

      {form && (
        <PartyForm business={business} party={form.party} onClose={() => setForm(null)}
          onSave={v => (form.party ? update(form.party, v, "Saved") : add(v))} />
      )}

      {text && (
        <TextSheet business={business} party={text.party} kind={text.kind} onClose={() => setText(null)}
          onMarkTexted={() => update(text.party, { status: "notified", notified_at: new Date().toISOString() })} />
      )}

      {menu && (
        <Sheet title={`${menu.name} · ${menu.size}`} onClose={() => setMenu(null)}>
          <div className="stack">
            {menu.phone && <>
              {isActive(menu) && <button className="btn ghost" onClick={() => { setText({ party: menu, kind: "added" }); setMenu(null); }}>💬 Text "you're on the list"</button>}
              <a className="btn ghost" href={`tel:${menu.phone}`}>📞 Call · {fmtPhone(menu.phone)}</a>
            </>}
            <button className="btn ghost" onClick={() => { setForm({ party: menu }); setMenu(null); }}>✏️ Edit party</button>
            {isActive(menu) && <>
              <button className="btn ghost" onClick={() => { update(menu, { status: "cancelled" }, "Removed from waitlist"); setMenu(null); }}>🚶 Left / cancelled</button>
              <button className="btn danger" onClick={() => { update(menu, { status: "noshow" }, "Marked no-show"); setMenu(null); }}>✕ No-show</button>
            </>}
            {canDelete && <button className="btn danger" onClick={() => { remove(menu); setMenu(null); }}>🗑 Delete permanently</button>}
          </div>
        </Sheet>
      )}
    </>
  );
}
