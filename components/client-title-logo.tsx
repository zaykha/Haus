"use client";

/* eslint-disable @next/next/no-img-element */

import { getClientOrganizationMark } from "@/lib/client-organizations";
import { ClientOrganization } from "@/lib/types";

type ClientTitleLogoProps = {
  organization?: Pick<ClientOrganization, "logoUrl" | "name"> | null;
  className?: string;
};

export function ClientTitleLogo({ organization, className }: ClientTitleLogoProps) {
  if (!organization) {
    return null;
  }

  if (!organization.logoUrl) {
    return <div className={className}>{getClientOrganizationMark(organization.name ?? "Organization")}</div>;
  }

  return <img className={className} src={organization.logoUrl} alt={organization.name ?? "Organization logo"} />;
}
