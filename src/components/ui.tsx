import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ---------- Sheet (bottom drawer on phones, dialog on iPad) ---------- */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <h2><span>{title}</span><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></h2>
        {children}
      </div>
    </div>
  );
}

/* ---------- Chip pickers ---------- */
export function Chips<T extends string | number>({ options, value, onChange, label }: {
  options: T[]; value: T | null; onChange: (v: T) => void; label?: (v: T) => string;
}) {
  return (
    <div className="chips">
      {options.map(o => (
        <button type="button" key={String(o)} className={`chip ${o === value ? "on" : ""}`} onClick={() => onChange(o)}>
          {label ? label(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function MultiChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map(o => (
        <button type="button" key={o} className={`chip ${value.includes(o) ? "on" : ""}`}
          onClick={() => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])}>
          {o}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const t = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m); setN(x => x + 1);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" key={n} role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Loading" />;

/** Re-render every `ms` so wait timers stay current. */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => { const i = window.setInterval(() => set(x => x + 1), ms); return () => window.clearInterval(i); }, [ms]);
}
