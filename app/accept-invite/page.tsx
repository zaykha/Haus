import { Suspense } from "react";
import { AcceptInviteScreen } from "@/components/accept-invite-screen";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteScreen />
    </Suspense>
  );
}
