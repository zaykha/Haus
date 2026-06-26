"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getUserClientOrganizationIds } from "@/lib/permissions";
import { ClientOrganization, User } from "@/lib/types";

const ACTIVE_CLIENT_ORG_STORAGE_KEY = "haus.activeClientOrganizationId";

export function useActiveClientOrganization(
  user: User | null,
  clientOrganizations: ClientOrganization[],
) {
  const searchParams = useSearchParams();
  const [storedOrganizationId, setStoredOrganizationId] = useState<string | null>(null);

  const clientOrganizationIds = useMemo(
    () => (user?.role === "client" ? getUserClientOrganizationIds(user) : []),
    [user],
  );

  useEffect(() => {
    if (typeof window === "undefined" || user?.role !== "client") {
      setStoredOrganizationId(null);
      return;
    }

    const nextStoredOrganizationId = window.localStorage.getItem(ACTIVE_CLIENT_ORG_STORAGE_KEY);
    setStoredOrganizationId(nextStoredOrganizationId);
  }, [user?.id, user?.role]);

  const requestedOrganizationId = searchParams.get("org");
  const activeClientOrganizationId =
    user?.role === "client"
      ? requestedOrganizationId && clientOrganizationIds.includes(requestedOrganizationId)
        ? requestedOrganizationId
        : storedOrganizationId && clientOrganizationIds.includes(storedOrganizationId)
          ? storedOrganizationId
          : clientOrganizationIds[0] ?? null
      : null;

  useEffect(() => {
    if (typeof window === "undefined" || user?.role !== "client") {
      return;
    }

    if (activeClientOrganizationId) {
      window.localStorage.setItem(ACTIVE_CLIENT_ORG_STORAGE_KEY, activeClientOrganizationId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_CLIENT_ORG_STORAGE_KEY);
  }, [activeClientOrganizationId, user?.role]);

  const activeClientOrganization = useMemo(
    () =>
      activeClientOrganizationId
        ? clientOrganizations.find((organization) => organization.id === activeClientOrganizationId) ?? null
        : null,
    [activeClientOrganizationId, clientOrganizations],
  );

  const scopedHref = (href: string) => {
    if (user?.role !== "client" || !activeClientOrganizationId) {
      return href;
    }

    const [path, hash = ""] = href.split("#");
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("org", activeClientOrganizationId);
    const nextQuery = params.toString();

    return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
  };

  return {
    activeClientOrganization,
    activeClientOrganizationId,
    clientOrganizationIds,
    scopedHref,
  };
}
