"use client";

/* eslint-disable @next/next/no-img-element */

import styled from "styled-components";
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

  const label = organization.name ?? "Organization";

  return (
    <LogoRoot className={className} aria-label={label}>
      {organization.logoUrl ? (
        <LogoImage src={organization.logoUrl} alt={label} />
      ) : (
        <LogoFallback aria-hidden="true">{getClientOrganizationMark(label)}</LogoFallback>
      )}
    </LogoRoot>
  );
}

const LogoRoot = styled.span`
  display: inline-grid;
  place-items: center;
  overflow: hidden;
  line-height: 1;
  vertical-align: middle;
`;

const LogoImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const LogoFallback = styled.span`
  display: inline-grid;
  place-items: center;
  width: 100%;
  height: 100%;
  text-align: center;
  line-height: 1;
`;
