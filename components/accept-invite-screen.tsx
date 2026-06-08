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
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await acceptInvitation({ token, password });
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="hero-card">
        <div className="hero-mark">H</div>
        <div>
          <p className="eyebrow">Invitation acceptance</p>
          <h1>Join Haus</h1>
          <p className="muted">
            Manual invite links are used for the MVP so managers can share them in any channel.
          </p>
        </div>
      </section>

      <section className="panel form-stack">
        {!token ? <p>Missing invitation token.</p> : null}
        {loadingRemote ? <p>Validating invitation…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {token && !loadingRemote && !error && !invite ? <p className="error-text">Invalid invitation.</p> : null}

        {invite ? (
          <>
            <div className="metadata-grid">
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
              <form className="form-stack" onSubmit={handleSubmit}>
                <label className="field">
                  <span>Create password</span>
                  <input
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                <button className="primary-button mobile-full-button" type="submit" disabled={submitting}>
                  {submitting ? "Creating account…" : "Accept invitation"}
                </button>
              </form>
            ) : (
              <p>This invitation is no longer available.</p>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
