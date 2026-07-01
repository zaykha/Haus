"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AvatarPicker } from "@/components/avatar-picker";
import { useAppState } from "@/components/app-state";
import { defaultProfileAvatarPath } from "@/lib/profile-avatars";
import { formatLabel, formatRole } from "@/lib/display";

interface RemoteInvitationPreview {
  email: string;
  name: string;
  role: string;
  projectName: string | null;
  clientOrganizationId?: string | null;
  clientOrganizationName?: string | null;
  status: string;
  expiresAt: string;
}

export function AcceptInviteScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { mode, state, getInvitationByToken, acceptInvitation } = useAppState();
  const departmentFieldRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [avatarPath, setAvatarPath] = useState<string>(defaultProfileAvatarPath);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
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

  const passwordRequirements = {
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  useEffect(() => {
    if (invite?.name) {
      setName(invite.name);
    }
  }, [invite?.name]);

  useEffect(() => {
    if (!departmentOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!departmentFieldRef.current?.contains(target)) {
        setDepartmentOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDepartmentOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [departmentOpen]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitting(true);
    setError("");
    setShowErrorPopup(false);

    if (!name.trim() || !phone.trim() || !password.trim() || (isClientInvite && !department.trim())) {
      setError("Fill in every required field.");
      setShowErrorPopup(true);
      setSubmitting(false);
      return;
    }

    try {
      await acceptInvitation({
        token,
        name,
        password,
        phone,
        jobTitle: isClientInvite ? jobTitle : undefined,
        department: isClientInvite ? department : undefined,
        avatarPath,
      });
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
                <Image
                  className="auth-logo auth-logo-onboarding"
                  src="/haus_logo.png"
                  alt="Haus"
                  width={112}
                  height={32}
                  priority
                />
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
                      <span className="stat-label">{isClientInvite ? "Client organization" : "Workspace"}</span>
                      <strong>{isClientInvite ? (invite.clientOrganizationName ?? "No client organization") : "Haus team"}</strong>
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
                    <form className="auth-form-stack onboarding-form" onSubmit={handleSubmit} noValidate>
                      <AvatarPicker
                        value={avatarPath}
                        onChange={setAvatarPath}
                        disabled={submitting}
                        helperText="This avatar will be used for your profile."
                      />

                      <label className={`${name ? "auth-field is-filled" : "auth-field"} ${submitAttempted && !name.trim() ? "is-invalid" : ""}`}>
                        <input
                          type="text"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder=" "
                          autoComplete="name"
                          required
                          disabled={submitting}
                        />
                        <span>Display name</span>
                      </label>

                      <label className={`${phone ? "auth-field is-filled" : "auth-field"} ${submitAttempted && !phone.trim() ? "is-invalid" : ""}`}>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder=" "
                          autoComplete="tel"
                          required
                          disabled={submitting}
                        />
                        <span>Contact number</span>
                      </label>

                      {isClientInvite ? (
                        <>
                          <label className={jobTitle ? "auth-field is-filled" : "auth-field"}>
                            <input
                              type="text"
                              value={jobTitle}
                              onChange={(event) => setJobTitle(event.target.value)}
                              placeholder=" "
                              autoComplete="organization-title"
                              disabled={submitting}
                            />
                            <span>Job title</span>
                          </label>

                          <div
                            ref={departmentFieldRef}
                            className={`auth-field onboarding-department-field ${department ? "is-filled" : ""} ${departmentOpen ? "is-open" : ""} ${submitAttempted && !department.trim() ? "is-invalid" : ""}`}
                          >
                            <button
                              type="button"
                              className="onboarding-department-trigger"
                              aria-haspopup="listbox"
                              aria-expanded={departmentOpen}
                              disabled={submitting}
                              onClick={() => setDepartmentOpen((current) => !current)}
                            >
                              <span className="onboarding-department-value">
                                {department}
                              </span>
                            </button>
                            <span className="auth-inline-label">Department</span>
                            {departmentOpen ? (
                              <div className="onboarding-department-menu" role="listbox" aria-label="Departments">
                                {state.departments && state.departments.length > 0 ? (
                                  state.departments.map((dept) => (
                                    <button
                                      key={dept.id}
                                      type="button"
                                      role="option"
                                      aria-selected={department === dept.name}
                                      className={`onboarding-department-option ${department === dept.name ? "is-active" : ""}`}
                                      onClick={() => {
                                        setDepartment(dept.name);
                                        setDepartmentOpen(false);
                                      }}
                                      disabled={submitting}
                                    >
                                      {dept.name}
                                    </button>
                                  ))
                                ) : (
                                  <div className="onboarding-department-option is-disabled">
                                    No departments available
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : null}

                      <label className={`${password ? "auth-field is-filled" : "auth-field"} ${submitAttempted && !password.trim() ? "is-invalid" : ""}`}>
                        <div className={`password-field ${submitAttempted && !password.trim() ? "is-invalid" : ""}`}>
                          <input
                            type={showPassword ? "text" : "password"}
                            minLength={8}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            onFocus={() => setPasswordFocused(true)}
                            onBlur={() => setPasswordFocused(false)}
                            placeholder=" "
                            autoComplete="new-password"
                            required
                            disabled={submitting}
                          />
                          <span className="auth-inline-label">Create password</span>
                          <button
                            className="password-toggle"
                            type="button"
                            disabled={submitting}
                            onClick={() => setShowPassword((current) => !current)}
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                      </label>

                      {passwordFocused ? (
                        <div className="password-requirements-card">
                          <h3 className="password-requirements-title">Password requirements</h3>
                          <div className="password-requirements-list">
                            <div className={`password-requirement ${passwordRequirements.minLength ? "met" : ""}`}>
                              <span className="requirement-check">✓</span>
                              <span className="requirement-text">At least 8 characters</span>
                            </div>
                            <div className={`password-requirement ${passwordRequirements.hasNumber ? "met" : ""}`}>
                              <span className="requirement-check">✓</span>
                              <span className="requirement-text">1 number (0-9)</span>
                            </div>
                            <div className={`password-requirement ${passwordRequirements.hasUppercase ? "met" : ""}`}>
                              <span className="requirement-check">✓</span>
                              <span className="requirement-text">1 uppercase letter (A-Z)</span>
                            </div>
                            <div className={`password-requirement ${passwordRequirements.hasLowercase ? "met" : ""}`}>
                              <span className="requirement-check">✓</span>
                              <span className="requirement-text">1 lowercase letter (a-z)</span>
                            </div>
                            <div className={`password-requirement ${passwordRequirements.hasSpecial ? "met" : ""}`}>
                              <span className="requirement-check">✓</span>
                              <span className="requirement-text">1 special character (!@#$%^&*)</span>
                            </div>
                          </div>
                        </div>
                      ) : null}

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
