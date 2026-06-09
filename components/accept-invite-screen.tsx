"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/components/app-state";
import { formatLabel, formatRole } from "@/lib/display";

interface RemoteInvitationPreview {
  email: string;
  name: string;
  role: string;
  projectName: string | null;
  status: string;
  expiresAt: string;
}

export function AcceptInviteScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { mode, state, getInvitationByToken, acceptInvitation } = useAppState();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remoteInvite, setRemoteInvite] = useState<RemoteInvitationPreview | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(mode === "supabase");

  const mockInvite = useMemo(() => {
    if (!token || mode !== "mock") {
      return null;
    }

    const invitation = getInvitationByToken(token);
    if (!invitation) {
      return null;
    }

    return {
      ...invitation,
      projectName: state.projects.find((project) => project.id === invitation.projectId)?.name ?? null,
    };
  }, [getInvitationByToken, mode, state.projects, token]);

  useEffect(() => {
    if (mode !== "supabase" || !token) {
      setLoadingRemote(false);
      return;
    }

    let cancelled = false;

    async function loadInvite() {
      try {
        const response = await fetch(`/api/invitations/lookup?token=${encodeURIComponent(token)}`);
        if (!response.ok) {
          throw new Error("Invalid invitation");
        }

        const data = (await response.json()) as RemoteInvitationPreview;
        if (!cancelled) {
          setRemoteInvite(data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Invalid invitation");
          setShowErrorPopup(true);
        }
      } finally {
        if (!cancelled) {
          setLoadingRemote(false);
        }
      }
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [mode, token]);

  const invite = mode === "mock" ? mockInvite : remoteInvite;
  const isClientInvite = invite?.role === "client";

  useEffect(() => {
    if (invite?.name) {
      setName(invite.name);
    }
  }, [invite?.name]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setShowErrorPopup(false);

    try {
      await acceptInvitation({ token, name, password });
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to accept invite");
      setShowErrorPopup(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen">
      {submitting ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Creating your workspace access...</p>
          </div>
        </div>
      ) : null}

      {showErrorPopup ? (
        <div className="auth-popup-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="invite-error-title">
          <div className="auth-popup-card">
            <h2 id="invite-error-title">Onboarding failed</h2>
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
            <div className="auth-card onboarding-card">
              <div className="auth-card-brand onboarding-brand">
                <div className="hero-mark">H</div>
                <p className="eyebrow">{isClientInvite ? "Client Onboarding" : "Team Onboarding"}</p>
                <h1>{isClientInvite ? "Join your client workspace" : "Join the team"}</h1>
                <p className="muted">
                  {isClientInvite
                    ? "Set your display name and password to access project updates, approvals, and feedback."
                    : "Set your display name and password to access your workspace, projects, and tasks."}
                </p>
              </div>

              {!token ? <p className="error-text">Missing invitation token.</p> : null}
              {loadingRemote ? <p className="muted onboarding-inline">Validating invitation...</p> : null}
              {token && !loadingRemote && !error && !invite ? (
                <p className="error-text">Invalid invitation.</p>
              ) : null}

              {invite ? (
                <>
                  <div className="onboarding-summary">
                    <div>
                      <span className="stat-label">Invited email</span>
                      <strong>{invite.email}</strong>
                    </div>
                    <div>
                      <span className="stat-label">Role</span>
                      <strong>{formatRole(invite.role)}</strong>
                    </div>
                    <div>
                      <span className="stat-label">Project</span>
                      <strong>{invite.projectName ?? "No project assigned"}</strong>
                    </div>
                    <div>
                      <span className="stat-label">Status</span>
                      <strong>{formatLabel(invite.status)}</strong>
                    </div>
                  </div>

                  {invite.status === "pending" ? (
                    <form className="auth-form-stack onboarding-form" onSubmit={handleSubmit}>
                      <label className={name ? "auth-field is-filled" : "auth-field"}>
                        <input
                          type="text"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder=" "
                          autoComplete="name"
                          required
                        />
                        <span>Display name</span>
                      </label>

                      <label className={password ? "auth-field is-filled" : "auth-field"}>
                        <div className="password-field">
                          <input
                            type={showPassword ? "text" : "password"}
                            minLength={8}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder=" "
                            autoComplete="new-password"
                            required
                          />
                          <span className="auth-inline-label">Create password</span>
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
                        <span>{isClientInvite ? "Continue to workspace" : "Join workspace"}</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </form>
                  ) : (
                    <p className="muted onboarding-inline">This invitation is no longer available.</p>
                  )}
                </>
              ) : null}
            </div>

            <p className="auth-footnote">
              Invite-only onboarding for managers, designers, and clients.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
