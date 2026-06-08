"use client";

import { PageHeader } from "@/components/ui";
import { useAppState } from "@/components/app-state";
import { formatRole } from "@/lib/display";

export function ProfileScreen() {
  const { user, logout, mode } = useAppState();

  if (!user) {
    return null;
  }

  return (
    <main className="page-stack">
      <PageHeader
        eyebrow="Account"
        title={user.name}
        detail="Manage your account details and sign out when you are done."
      />

      <section className="panel">
        <div className="metadata-grid">
          <div>
            <span className="stat-label">Email</span>
            <strong>{user.email}</strong>
          </div>
          <div>
            <span className="stat-label">Role</span>
            <strong>{formatRole(user.role)}</strong>
          </div>
          <div>
            <span className="stat-label">Mode</span>
            <strong>{mode}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <button className="secondary-button mobile-full-button" type="button" onClick={() => logout()}>
          Sign out
        </button>
      </section>
    </main>
  );
}
