import { FormEvent, useEffect, useState } from "react";
import type { Business, Party } from "../lib/types";
import { isActive } from "../lib/types";
import { fmtClock, fmtDur, fmtPhone, minutesSince, smsHref, toE164 } from "../lib/format";
import { fillTemplate, statusLink } from "../lib/template";
import { sendSms, smsEnabled } from "../lib/api";
import { Chips, MultiChips, Sheet, useToast } from "./ui";

export const TAGS = ["High chair", "Booster", "Wheelchair", "Birthday 🎂", "VIP", "Stroller"];
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/* ---------- one party on the board ---------- */
export function PartyCard({ p, index, canWrite, onText, onSeat, onRestore, onMenu }: {
  p: Party; index: number; canWrite: boolean;
  onText: () => void; onSeat: () => void; onRestore: () => void; onMenu: () => void;
}) {
  const active = isActive(p);
  const now = Date.now();
  const end = active ? null : p.seated_at || p.removed_at;
  const waited = end ? Math.max(0, Math.floor((new Date(end).getTime() - new Date(p.added_at).getTime()) / 60000)) : minutesSince(p.added_at, now);
  const late = active && p.quote_min != null && waited > p.quote_min;

  return (
    <div className={`party ${p.status} ${late ? "late" : ""}`}>
      <div className="row1">
        {active && <div className="pos">{index + 1}</div>}
        <div className="who">
          <div className="name">{p.name}</div>
          <div className="meta">{p.phone ? fmtPhone(p.phone) : "No phone"} · added {fmtClock(p.added_at)}</div>
        </div>
        <div className="size">{p.size}</div>
        <div className="timebox">
          <div className="elapsed">{fmtDur(waited)}</div>
          <div className="quote">{p.quote_min != null ? `quoted ${p.quote_min}m` : "waited"}</div>
        </div>
      </div>
      <div className="tags">
        {late && <span className="tag red">Past quote</span>}
        {p.status === "notified" && <span className="tag gold">Texted {fmtDur(minutesSince(p.notified_at, now))} ago</span>}
        {p.status === "seated" && <span className="tag green">Seated {fmtClock(p.seated_at)}</span>}
        {p.status === "noshow" && <span className="tag red">No-show</span>}
        {p.status === "cancelled" && <span className="tag">Left / cancelled</span>}
        {p.source === "guest" && <span className="tag brand">Self check-in</span>}
        {p.seat && p.seat !== "Any" && <span className="tag">{p.seat}</span>}
        {p.tags.map(t => <span className="tag" key={t}>{t}</span>)}
      </div>
      {p.notes && <div className="notes">{p.notes}</div>}
      {active ? (
        <div className="actions">
          <button className="btn text" disabled={!p.phone || !canWrite} onClick={onText}>
            💬 {!p.phone ? "No phone" : p.status === "notified" ? "Text again" : "Table ready"}
          </button>
          <button className="btn seat" disabled={!canWrite} onClick={onSeat}>✓ Seat</button>
          <button className="btn more" onClick={onMenu} aria-label="More options">⋯</button>
        </div>
      ) : (
        <div className="actions" style={{ gridTemplateColumns: "1fr auto" }}>
          <button className="btn ghost" disabled={!canWrite} onClick={onRestore}>↩︎ Back to waitlist</button>
          <button className="btn more" onClick={onMenu} aria-label="More options">⋯</button>
        </div>
      )}
    </div>
  );
}

/* ---------- add / edit form ---------- */
export interface PartyInput {
  name: string; phone: string | null; size: number; quote_min: number | null;
  seat: string; tags: string[]; notes: string | null;
}

export function PartyForm({ business, party, onSave, onClose }: {
  business: Business; party: Party | null;
  onSave: (v: PartyInput) => Promise<boolean>; onClose: () => void;
}) {
  const [name, setName] = useState(party?.name || "");
  const [phone, setPhone] = useState(party?.phone ? fmtPhone(party.phone) : "");
  const [size, setSize] = useState(party?.size || 2);
  const [bigSize, setBigSize] = useState(party && party.size > 10 ? String(party.size) : "");
  const [quote, setQuote] = useState<number | null>(party ? party.quote_min : 15);
  const [seat, setSeat] = useState(party?.seat || business.seat_options[0] || "Any");
  const [tags, setTags] = useState<string[]>(party?.tags || []);
  const [notes, setNotes] = useState(party?.notes || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Add a name for the party.");
    const e164 = toE164(phone);
    if (e164 === "invalid") return setErr("That phone number looks short — use 10 digits, or leave it blank.");
    const finalSize = size === 10 && bigSize ? Math.min(99, Math.max(10, parseInt(bigSize) || 10)) : size;
    setBusy(true);
    const ok = await onSave({ name: name.trim(), phone: e164, size: finalSize, quote_min: quote, seat, tags, notes: notes.trim() || null });
    setBusy(false);
    if (ok) onClose(); else setErr("Couldn't save — check your connection and try again.");
  }

  return (
    <Sheet title={party ? "Edit party" : "New party"} onClose={onClose}>
      <form onSubmit={submit} autoComplete="off">
        <label className="f" htmlFor="pn">Name</label>
        <input id="pn" className="in" autoFocus={!party} placeholder="Guest name" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
        <label className="f" htmlFor="pp">Mobile (for text alerts)</label>
        <input id="pp" className="in" type="tel" inputMode="tel" placeholder="(360) 555-0123" maxLength={20}
          value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => toE164(phone)?.startsWith("+1") && setPhone(fmtPhone(phone))} />
        <label className="f">Party size</label>
        <Chips options={SIZES} value={size} onChange={setSize} label={v => (v === 10 ? "10+" : String(v))} />
        {size === 10 && (
          <input className="in" style={{ marginTop: 8 }} type="number" inputMode="numeric" min={10} max={99}
            placeholder="Exact size (10 or more)" value={bigSize} onChange={e => setBigSize(e.target.value)} />
        )}
        <label className="f">Quoted wait</label>
        <Chips options={business.quote_options} value={quote} onChange={setQuote} label={v => `${v}m`} />
        {business.seat_options.length > 0 && <>
          <label className="f">Seating</label>
          <Chips options={business.seat_options} value={seat} onChange={setSeat} />
        </>}
        <label className="f">Tags</label>
        <MultiChips options={TAGS} value={tags} onChange={setTags} />
        <label className="f" htmlFor="pnotes">Notes</label>
        <textarea id="pnotes" className="in" maxLength={300} placeholder="Allergies, celebrating, waiting at the bar…" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="err">{err}</div>
        <div className="foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Saving…" : party ? "Save changes" : "Add to waitlist"}</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- texting ---------- */
export function TextSheet({ business, party, kind, onMarkTexted, onClose }: {
  business: Business; party: Party; kind: "ready" | "added";
  onMarkTexted: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const [auto, setAuto] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [marked, setMarked] = useState(false);
  useEffect(() => { smsEnabled().then(setAuto); }, []);

  const body = fillTemplate(kind === "ready" ? business.sms_ready : business.sms_added, {
    name: party.name, business: business.name, wait: party.quote_min, link: statusLink(location.origin, party.public_token),
  });

  const mark = () => { if (kind === "ready" && !marked) { setMarked(true); onMarkTexted(); } };

  async function send() {
    setBusy(true); setErr("");
    try {
      await sendSms(party.id, kind);
      toast(`Text sent to ${party.name.split(" ")[0]}`);
      onClose();
    } catch (e) {
      setErr((e as Error).message + " You can still send it from your phone below.");
      setAuto(false);
    } finally { setBusy(false); }
  }

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
    catch { toast("Couldn't copy — press and hold the text to copy it"); }
  }

  return (
    <Sheet title={kind === "ready" ? "Table ready" : "On the list"} onClose={onClose}>
      <label className="f">To</label>
      <div className="notes" style={{ fontSize: 18, fontWeight: 700 }}>{party.name} · {fmtPhone(party.phone)}</div>
      <label className="f">Message</label>
      <div className="notes" style={{ fontSize: 15, lineHeight: 1.45 }}>{body}</div>
      <div className="err">{err}</div>
      <div className="stack">
        {auto === null && <button className="btn primary" disabled>Checking…</button>}
        {auto && <button className="btn primary" style={{ justifyContent: "center" }} disabled={busy} onClick={send}>{busy ? "Sending…" : "📤 Send text"}</button>}
        {auto === false && <>
          <a className="btn primary" href={smsHref(party.phone!, body)} onClick={mark}>💬 Open in Messages</a>
          <button className="btn ghost" onClick={() => { copy(body, "Message"); mark(); }}>📋 Copy message</button>
          <button className="btn ghost" onClick={() => copy(fmtPhone(party.phone), "Number")}>📋 Copy phone number</button>
          <p className="small">Texts send from this device until Twilio is connected. If Messages doesn't open, copy the message and number into a new text.</p>
        </>}
      </div>
    </Sheet>
  );
}
