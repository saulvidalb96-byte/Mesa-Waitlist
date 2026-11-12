import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { configProblem, configured, supabase } from "./lib/supabase";
import type { Business, Membership, Role } from "./lib/types";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Board from "./pages/Board";
import Settings from "./pages/Settings";
import GuestStatus from "./pages/GuestStatus";
import GuestJoin from "./pages/GuestJoin";

export const APP_NAME = "Mesa";

/* ---------- current business for signed-in staff ---------- */
interface Ctx {
  session: Session;
  business: Business;
  role: Role;
  memberships: Membership[];
  switchTo: (id: string) => void;
  reload: () => Promise<void>;
}
const BizCtx = createContext<Ctx | null>(null);
export const useBiz = () => useContext(BizCtx)!;

export function applyBrand(color: string) {
  document.documentElement.style.setProperty("--brand", color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export default function App() {
  return (
    <Routes>
      <Route path="/s/:token" element={<GuestStatus />} />
      <Route path="/join/:slug" element={<GuestJoin />} />
      <Route path="/*" element={<Staff />} />
    </Routes>
  );
}

function Staff() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [current, setCurrent] = useState<string | null>(() => {
    try { return localStorage.getItem("mesa.business"); } catch { return null; }
  });
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const reload = useCallback(async () => {
    if (!uid) { setMemberships(null); return; }
    const { data, error } = await supabase
      .from("members")
      .select("business_id, role, businesses(*)")
      .eq("user_id", uid);
    if (error) { setLoadErr(error.message); return; }
    setLoadErr("");
    setMemberships(((data || []) as unknown as Membership[]).filter(m => m.businesses));
  }, [uid]);

  useEffect(() => { reload(); }, [reload]);

  const switchTo = useCallback((id: string) => {
    setCurrent(id);
    try { localStorage.setItem("mesa.business", id); } catch { /* private mode */ }
  }, []);

  const m = memberships?.find(x => x.business_id === current) || memberships?.[0];
  useEffect(() => { if (m) applyBrand(m.businesses.brand_color); }, [m]);

  if (!configured) return <SetupNeeded />;
  if (session === undefined) return <Spinner />;
  if (!session) return <Login />;
  if (loadErr) return <div className="page center"><p>Couldn't load your account: {loadErr}</p><button className="btn primary block" onClick={reload}>Try again</button></div>;
  if (!memberships) return <Spinner />;
  if (!m) return <Onboarding onCreated={async id => { switchTo(id); await reload(); }} />;

  const ctx: Ctx = { session, business: m.businesses, role: m.role, memberships, switchTo, reload };
  return (
    <BizCtx.Provider value={ctx}>
      <Routes>
        <Route path="/" element={<Board />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BizCtx.Provider>
  );
}

function SetupNeeded() {
  return (
    <div className="page">
      <div className="logo">{APP_NAME}</div>
      <div className="card">
        <h3>Almost there</h3>
        <p className="small">This site isn't connected to its database yet:</p>
        <p style={{ fontWeight: 600 }}>{configProblem}</p>
        <p className="small">
          Fix it in Netlify under <b>Project configuration → Environment variables</b>, then go to
          <b> Deploys → Trigger deploy → Deploy project</b>.
        </p>
      </div>
    </div>
  );
}
