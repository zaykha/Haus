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
    return null;
  }

  return <>{children}</>;
}
