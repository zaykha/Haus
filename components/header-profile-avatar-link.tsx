"use client";

import Link from "next/link";
import styled from "styled-components";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/lib/types";

const desktop = "@media (min-width: 768px)";

type HeaderProfileAvatarLinkProps = {
  user: Pick<User, "name" | "avatarPath">;
  href?: string;
  ariaLabel?: string;
  className?: string;
};

export function HeaderProfileAvatarLink({
  user,
  href = "/profile",
  ariaLabel = "Open profile",
  className,
}: HeaderProfileAvatarLinkProps) {
  return (
    <AvatarLink href={href} aria-label={ariaLabel} className={className}>
      <AvatarWrap>
        <UserAvatar user={user} />
      </AvatarWrap>
    </AvatarLink>
  );
}

const AvatarLink = styled(Link)`
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 22px rgba(31, 31, 31, 0.06);
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    background: rgba(255, 250, 243, 0.96);
    border-color: rgba(220, 208, 194, 0.95);
    box-shadow: 0 14px 28px rgba(31, 31, 31, 0.08);
  }

  ${desktop} {
    width: 60px;
    height: 60px;
    flex: 0 0 60px;
  }
`;

const AvatarWrap = styled.span`
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 999px;
  overflow: hidden;
  display: grid;
  place-items: center;

  ${desktop} {
    width: 50px;
    height: 50px;
    flex: 0 0 50px;
  }
`;
