import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as acceptInvitation } from "@/app/api/invitations/accept/route";
import { POST as createInvitation } from "@/app/api/invitations/create/route";
import { POST as regenerateInvitation } from "@/app/api/invitations/regenerate/route";
import { hashInvitationToken } from "@/lib/invitations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createFakeSupabaseAdminClient, type DatabaseState } from "@/test/support/fake-supabase-admin";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

const mockedGetSupabaseAdminClient = vi.mocked(getSupabaseAdminClient);

function createJsonRequest(url: string, body: Record<string, any>, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

function buildInvitationExpiryIso(daysFromNow = 7) {
  const next = new Date();
  next.setDate(next.getDate() + daysFromNow);
  next.setHours(23, 59, 59, 0);
  return next.toISOString();
}

function extractTokenFromInviteLink(inviteLink: string) {
  return new URL(inviteLink).searchParams.get("token");
}

describe("invitation flow routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid email input before creating an invitation", async () => {
    const supabase = createFakeSupabaseAdminClient();
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await createInvitation(
      createJsonRequest("http://localhost/api/invitations/create", {
        email: "not-an-email",
        role: "designer",
        expiresAt: buildInvitationExpiryIso(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Enter a valid email address.",
    });
    expect(supabase.state.invitations).toHaveLength(0);
  });

  it("purges archived users from trash before creating a fresh invite", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        profiles: [
          {
            id: "manager-1",
            email: "manager@example.com",
            role: "communication_manager",
            company: "Haus",
          },
          {
            id: "archived-1",
            email: "archived@example.com",
            role: "designer",
            company: "Haus",
            deleted_at: "2026-07-01T00:00:00.000Z",
            delete_reason: "liaison_deleted",
          },
        ],
        client_organization_liaisons: [
          {
            profile_id: "archived-1",
            client_organization_id: "org-1",
            delete_reason: "liaison_deleted",
          },
        ],
        invitations: [
          {
            id: "invite-old",
            email: "archived@example.com",
            delete_reason: "liaison_deleted",
          },
        ],
      },
      authUsers: [
        {
          id: "archived-1",
          email: "archived@example.com",
        },
      ],
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await createInvitation(
      createJsonRequest(
        "http://localhost/api/invitations/create",
        {
          email: "archived@example.com",
          role: "designer",
          expiresAt: buildInvitationExpiryIso(),
        },
        {
          "x-haus-user-id": "manager-1",
        },
      ),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { inviteLink: string; invitation: { email: string; status: string } };
    const token = extractTokenFromInviteLink(payload.inviteLink);

    expect(token).toBeTruthy();
    expect(payload.invitation.email).toBe("archived@example.com");
    expect(payload.invitation.status).toBe("pending");
    expect(supabase.state.profiles.find((profile) => profile.id === "archived-1")).toBeUndefined();
    expect(supabase.state.client_organization_liaisons.find((row) => row.profile_id === "archived-1")).toBeUndefined();
    expect(supabase.state.invitations.some((row) => row.id === "invite-old")).toBe(false);
    await expect(supabase.getAuthUsers()).resolves.not.toContainEqual(
      expect.objectContaining({ id: "archived-1" }),
    );
    expect(supabase.state.invitations).toContainEqual(
      expect.objectContaining({
        email: "archived@example.com",
        status: "pending",
        token_hash: hashInvitationToken(String(token)),
      }),
    );
  });

  it("returns a detailed existing-user error to managers", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        profiles: [
          {
            id: "manager-1",
            email: "manager@example.com",
            role: "creative_manager",
            company: "Haus",
          },
          {
            id: "client-1",
            email: "exists@example.com",
            role: "client",
            company: null,
            deleted_at: null,
          },
        ],
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
          },
        ],
        client_organization_liaisons: [
          {
            profile_id: "client-1",
            client_organization_id: "org-1",
            is_primary: true,
            deleted_at: null,
          },
        ],
      },
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await createInvitation(
      createJsonRequest(
        "http://localhost/api/invitations/create",
        {
          email: "exists@example.com",
          role: "designer",
          expiresAt: buildInvitationExpiryIso(),
        },
        {
          "x-haus-user-id": "manager-1",
        },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "User already present. Current role: Client. Company: Acme Foods.",
    });
  });

  it("returns a client-safe existing-user message to clients", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        profiles: [
          {
            id: "client-requester",
            email: "client.requester@example.com",
            role: "client",
            company: null,
          },
          {
            id: "existing-user",
            email: "exists@example.com",
            role: "designer",
            company: "Haus",
            deleted_at: null,
          },
        ],
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
          },
        ],
        client_organization_liaisons: [
          {
            profile_id: "client-requester",
            client_organization_id: "org-1",
            is_primary: true,
          },
        ],
      },
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await createInvitation(
      createJsonRequest(
        "http://localhost/api/invitations/create",
        {
          email: "exists@example.com",
          role: "client",
          clientOrganizationId: "org-1",
          expiresAt: buildInvitationExpiryIso(),
        },
        {
          "x-haus-user-id": "client-requester",
        },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "User already exists in the workspace. Please contact a manager to add them.",
    });
  });

  it("lets a manager create an invite and the invited user complete onboarding", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        profiles: [
          {
            id: "manager-1",
            email: "manager@example.com",
            role: "communication_manager",
            company: "Haus",
          },
        ],
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
          },
        ],
        invitations: [],
      },
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const createResponse = await createInvitation(
      createJsonRequest(
        "http://localhost/api/invitations/create",
        {
          email: "new.client@example.com",
          role: "client",
          clientOrganizationId: "org-1",
          expiresAt: buildInvitationExpiryIso(),
        },
        {
          "x-haus-user-id": "manager-1",
        },
      ),
    );

    expect(createResponse.status).toBe(200);
    const createPayload = (await createResponse.json()) as { inviteLink: string };
    const token = extractTokenFromInviteLink(createPayload.inviteLink);

    expect(token).toBeTruthy();
    expect(supabase.state.invitations).toHaveLength(1);
    expect(supabase.state.invitations[0]).toMatchObject({
      email: "new.client@example.com",
      status: "pending",
      client_organization_id: "org-1",
    });

    const acceptResponse = await acceptInvitation(
      createJsonRequest("http://localhost/api/invitations/accept", {
        token,
        name: "New Client",
        password: "password123",
        phone: "099999999",
        department: "Marketing",
      }),
    );

    expect(acceptResponse.status).toBe(200);
    await expect(acceptResponse.json()).resolves.toMatchObject({
      user: expect.objectContaining({
        email: "new.client@example.com",
        role: "client",
        clientOrganizationId: "org-1",
      }),
    });
    expect(supabase.state.profiles).toContainEqual(
      expect.objectContaining({
        email: "new.client@example.com",
        name: "New Client",
        role: "client",
      }),
    );
    expect(supabase.state.client_organization_liaisons).toContainEqual(
      expect.objectContaining({
        client_organization_id: "org-1",
        is_primary: true,
      }),
    );
    expect(supabase.state.invitations[0]).toMatchObject({
      status: "accepted",
    });
  });

  it("regenerates only pending invites and invalidates the previous token", async () => {
    const oldToken = "old-token";
    const oldHash = hashInvitationToken(oldToken);
    const oldExpiry = "2026-07-01T00:00:00.000Z";
    const invitationState: DatabaseState = {
      profiles: [
        {
          id: "manager-1",
          email: "manager@example.com",
          role: "communication_manager",
        },
      ],
      invitations: [
        {
          id: "invite-1",
          email: "invitee@example.com",
          name: "Invitee",
          role: "designer",
          project_id: null,
          client_organization_id: null,
          token_hash: oldHash,
          status: "pending",
          expires_at: oldExpiry,
          accepted_at: null,
          created_by: "manager-1",
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    };
    const supabase = createFakeSupabaseAdminClient({ state: invitationState });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const regenerateResponse = await regenerateInvitation(
      createJsonRequest(
        "http://localhost/api/invitations/regenerate",
        {
          invitationId: "invite-1",
        },
        {
          "x-haus-user-role": "communication_manager",
        },
      ),
    );

    expect(regenerateResponse.status).toBe(200);
    const regeneratePayload = (await regenerateResponse.json()) as { inviteLink: string; invitation: { expiresAt: string } };
    const newToken = extractTokenFromInviteLink(regeneratePayload.inviteLink);

    expect(newToken).toBeTruthy();
    expect(hashInvitationToken(String(newToken))).not.toBe(oldHash);
    expect(new Date(regeneratePayload.invitation.expiresAt).getTime()).toBeGreaterThan(
      new Date(oldExpiry).getTime(),
    );

    const oldTokenAcceptResponse = await acceptInvitation(
      createJsonRequest("http://localhost/api/invitations/accept", {
        token: oldToken,
        name: "Invitee",
        password: "password123",
        phone: "099999999",
      }),
    );

    expect(oldTokenAcceptResponse.status).toBe(404);
    await expect(oldTokenAcceptResponse.json()).resolves.toMatchObject({
      error: "Invitation not found",
    });
  });

  it("rejects onboarding acceptance when required fields are missing", async () => {
    const token = "pending-token";
    const supabase = createFakeSupabaseAdminClient({
      state: {
        invitations: [
          {
            id: "invite-1",
            email: "invitee@example.com",
            name: "Invitee",
            role: "designer",
            project_id: null,
            client_organization_id: null,
            token_hash: hashInvitationToken(token),
            status: "pending",
            expires_at: buildInvitationExpiryIso(),
            accepted_at: null,
          },
        ],
      },
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await acceptInvitation(
      createJsonRequest("http://localhost/api/invitations/accept", {
        token,
        name: "Invitee",
        password: "short",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Name, phone number, token, and password are required",
    });
  });

  it("accepts a valid invite and creates auth, profile, liaison, and project membership records", async () => {
    const token = "fresh-token";
    const supabase = createFakeSupabaseAdminClient({
      state: {
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
          },
        ],
        invitations: [
          {
            id: "invite-1",
            email: "invitee@example.com",
            name: "Invitee",
            role: "client",
            project_id: "project-1",
            client_organization_id: "org-1",
            token_hash: hashInvitationToken(token),
            status: "pending",
            expires_at: buildInvitationExpiryIso(),
            accepted_at: null,
          },
        ],
      },
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await acceptInvitation(
      createJsonRequest("http://localhost/api/invitations/accept", {
        token,
        name: "Invitee Accepted",
        password: "password123",
        phone: "099999999",
        department: "Marketing",
        jobTitle: "Liaison",
        avatarPath: "/farm-oriented-animals/cow.png",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: expect.objectContaining({
        email: "invitee@example.com",
        role: "client",
        clientOrganizationId: "org-1",
        clientOrganizationIds: ["org-1"],
      }),
    });

    expect(supabase.state.profiles).toHaveLength(1);
    expect(supabase.state.profiles[0]).toMatchObject({
      email: "invitee@example.com",
      name: "Invitee Accepted",
      role: "client",
      department: "Marketing",
    });
    expect(supabase.state.client_organization_liaisons).toContainEqual(
      expect.objectContaining({
        client_organization_id: "org-1",
        is_primary: true,
      }),
    );
    expect(supabase.state.project_members).toContainEqual(
      expect.objectContaining({
        project_id: "project-1",
        role: "client",
      }),
    );
    expect(supabase.state.invitations[0]).toMatchObject({
      status: "accepted",
    });
    await expect(supabase.getAuthUsers()).resolves.toHaveLength(1);
  });

  it("rolls back auth and profile when invite acceptance fails after user creation", async () => {
    const token = "project-token";
    const supabase = createFakeSupabaseAdminClient({
      state: {
        invitations: [
          {
            id: "invite-1",
            email: "designer@example.com",
            name: "Designer",
            role: "designer",
            project_id: "project-1",
            client_organization_id: null,
            token_hash: hashInvitationToken(token),
            status: "pending",
            expires_at: buildInvitationExpiryIso(),
            accepted_at: null,
          },
        ],
      },
      failures: {
        "project_members:insert": "membership failed",
      },
    });
    mockedGetSupabaseAdminClient.mockReturnValue(supabase as never);

    const response = await acceptInvitation(
      createJsonRequest("http://localhost/api/invitations/accept", {
        token,
        name: "Designer Accepted",
        password: "password123",
        phone: "099999999",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "membership failed",
    });
    expect(supabase.state.profiles).toHaveLength(0);
    expect(supabase.state.project_members).toHaveLength(0);
    expect(supabase.state.invitations[0]).toMatchObject({
      status: "pending",
      accepted_at: null,
    });
    await expect(supabase.getAuthUsers()).resolves.toHaveLength(0);
  });
});
