import { Suspense } from "react";
import { AcceptInviteScreen } from "@/components/accept-invite-screen";

function OnboardingFallback() {
  return (
    <main className="auth-screen">
      <div className="auth-loading-overlay" role="status" aria-live="polite">
        <div className="auth-loading-card">
          <div className="auth-loading-spinner" aria-hidden="true" />
          <p>Loading invitation...</p>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <AcceptInviteScreen />
    </Suspense>
  );
}