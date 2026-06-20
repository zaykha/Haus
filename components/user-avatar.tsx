"use client";

import styled, { css } from "styled-components";
import { User } from "@/lib/types";

type UserAvatarProps = {
  user: Pick<User, "name" | "avatarPath">;
  className?: string;
};

export function UserAvatar({ user, className }: UserAvatarProps) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "U";

  if (user.avatarPath) {
    return <AvatarImage className={className} src={user.avatarPath} alt={user.name} />;
  }

  return <AvatarFallback className={className}>{initial}</AvatarFallback>;
}

const avatarBase = css`
  width: 100%;
  height: 100%;
  border-radius: inherit;
  display: block;
`;

const AvatarImage = styled.img`
  ${avatarBase}
  object-fit: cover;
  background: #f7f1e8;
`;

const AvatarFallback = styled.span`
  ${avatarBase}
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #5e4c37;
  font-weight: 800;
`;
