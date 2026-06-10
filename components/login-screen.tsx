"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state";

export function LoginScreen() {
  const router = useRouter();
  const { login, mode, ready, user } = useAppState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && user) {
      router.replace("/dashboard");
    }
  }, [ready, router, user]);

  if (!ready) {
    return null;
  }

  if (user) {
    return (
      <main className="auth-screen">
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Opening dashboard...</p>
          </div>
        </div>
      </main>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setShowErrorPopup(false);
    setSubmitting(true);

    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
      setShowErrorPopup(true);
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen">
      {submitting ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Signing in...</p>
          </div>
        </div>
      ) : null}

      {showErrorPopup ? (
        <div className="auth-popup-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="auth-error-title">
          <div className="auth-popup-card">
            <h2 id="auth-error-title">Sign-in failed</h2>
            <p>{error}</p>
            <button className="primary-button mobile-full-button" type="button" onClick={() => setShowErrorPopup(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <div className="auth-browser">
        <div className="auth-browser-body">
          <section className="auth-form-column">
            <div className="auth-card">
              <div className="auth-card-brand">
                <h1 className="auth-brand">Haus</h1>
                <p className="muted">Design project tracking for creative teams and clients.</p>
              </div>

              <form className="auth-form-stack" onSubmit={handleSubmit}>
                <label className={email ? "auth-field is-filled" : "auth-field"}>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder=" "
                    autoComplete="email"
                    required
                  />
                  <span>Email address</span>
                </label>

                <label className={password ? "auth-field is-filled" : "auth-field"}>
                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder=" "
                      autoComplete="current-password"
                      required={mode === "supabase"}
                    />
                    <span className="auth-inline-label">Password</span>
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <button className="primary-button mobile-full-button auth-submit" type="submit" disabled={submitting}>
                  <span>Continue</span>
                  <span aria-hidden="true">→</span>
                </button>

                <div className="auth-help">
                  <span className="help-icon">?</span>
                  <p className="muted">Need help accessing your workspace?</p>
                </div>
              </form>
            </div>

            <p className="auth-footnote">
              {mode === "supabase"
                ? "Invite-only access for managers, designers, and clients."
                : "Invite-only access for managers, designers, and clients."}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
