"use client";
import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, ArrowRight, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
export function LoginForm() {
  const [hint, setHint] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/backend/auth/demo", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.enabled) setHint(d);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/backend/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (!r.ok) {
        setError(
          r.status === 429
            ? "Too many attempts. Please wait 15 minutes."
            : r.status === 401
              ? "Incorrect email or password."
              : r.status === 422
                ? "Enter a valid email and password."
                : "Sign-in is unavailable. Check that the backend is running.",
        );
        return;
      }
      window.location.replace("/");
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <section className="login-story">
        <Brand />
        <div>
          <div className="eyebrow">MV / OPERATIONS PLATFORM</div>
          <h1>
            Read the signal.
            <br />
            Know the state.
          </h1>
          <p>
            A working view of your fleet. Inspect telemetry, investigate
            exceptions, and keep a record of every maintenance change.
          </p>
        </div>
        <div className="system-index" aria-label="Platform capabilities">
          <div>
            <span>01 / OBSERVE</span>
            <p>Fleet telemetry &amp; asset state</p>
          </div>
          <div>
            <span>02 / RESPOND</span>
            <p>Thresholds &amp; alert review</p>
          </div>
          <div>
            <span>03 / MAINTAIN</span>
            <p>Service schedules &amp; history</p>
          </div>
        </div>
        <span className="muted">
          <ShieldCheck size={15} /> MARKUP VENTURES / INDUSTRIAL SYSTEMS
        </span>
      </section>
      <section className="login-card">
        <span className="login-lock">
          <LockKeyhole size={24} />
        </span>
        <div className="eyebrow">ACCESS / OPERATOR</div>
        <h2>Sign in.</h2>
        <p>Sign in to your Markup Ventures workspace.</p>
        <form onSubmit={submit}>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            placeholder="you@company.com"
            disabled={busy}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            placeholder="Enter your password"
            disabled={busy}
          />
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to workspace"}
            <ArrowRight size={16} />
          </button>
        </form>
        {hint && (
          <aside className="login-hint">
            <strong>Explore the local demo</strong>
            <p>
              Email: <code>{hint.email}</code>
              <br />
              Password: <code>{hint.password}</code>
            </p>
            <small>Public demo credentials · Development only</small>
          </aside>
        )}
        <p className="login-note">
          <ShieldCheck size={13} /> Sessions expire after one hour.
        </p>
      </section>
    </main>
  );
}
