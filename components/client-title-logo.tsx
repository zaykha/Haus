"use client";

/* eslint-disable @next/next/no-img-element */

import { ClientOrganization } from "@/lib/types";

type ClientTitleLogoProps = {
  organization?: Pick<ClientOrganization, "logoUrl" | "name"> | null;
  className?: string;
};

export function ClientTitleLogo({ organization, className }: ClientTitleLogoProps) {
  if (!organization?.logoUrl) {
    return null;
  }

  return <img className={className} src={organization.logoUrl} alt={organization.name ?? "Organization logo"} />;
}
