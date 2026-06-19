"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state";

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, user } = useAppState();

  useEffect(() => {
    if (ready && !user) {
      router.replace("/");
    }
  }, [ready, router, user]);

  if (!ready || !user) {
    return (
      <main className="auth-screen">
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Loading dashboard...</p>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
