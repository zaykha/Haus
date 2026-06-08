import { createHash, randomBytes } from "crypto";
import { InvitationStatus, Role } from "@/lib/types";

export interface InvitationPreview {
  email: string;
  name: string;
  role: Role;
  projectName: string | null;
  status: InvitationStatus;
  expiresAt: string;
}

export function generateSecureInvitationToken() {
  return randomBytes(24).toString("hex");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function deriveInvitationStatus(status: InvitationStatus, expiresAt: string) {
  if (status !== "pending") {
    return status;
  }

  return new Date(expiresAt).getTime() < Date.now() ? "expired" : "pending";
}
