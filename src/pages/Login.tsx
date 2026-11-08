import { FormEvent, useState } from "react";
import { friendlyError, supabase } from "../lib/supabase";
import { APP_NAME } from "../App";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setNote(""); setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "up") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) setNote("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + "/settings#password" });
        if (error) throw error;
        setNote("If that email has an account, a reset link is on its way.");
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="center" style={{ marginTop: 30 }}>
        <div className="logo">{APP_NAME}</div>
        <p className="small">The waitlist for your host stand</p>
      </div>
      <form className="card" onSubmit={submit}>
        <h3>{mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset password"}</h3>
        <label className="f" htmlFor="em">Email</label>
        <input id="em" className="in" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        {mode !== "reset" && <>
          <label className="f" htmlFor="pw">Password</label>
          <input id="pw" className="in" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required value={password} onChange={e => setPassword(e.target.value)} />
        </>}
        <div className="err">{err}</div>
        {note && <p className="small" style={{ color: "var(--sage)" }}>{note}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "One moment…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
        </button>
      </form>
      <p className="small center" style={{ marginTop: 18 }}>
        {mode === "in" ? <>
          New business? <button className="linkish" onClick={() => setMode("up")}>Create an account</button><br />
          <button className="linkish" style={{ marginTop: 8 }} onClick={() => setMode("reset")}>Forgot password?</button>
        </> : <button className="linkish" onClick={() => setMode("in")}>Back to sign in</button>}
      </p>
      <p className="small center">Staff: ask your manager for your login.</p>
    </div>
  );
}
