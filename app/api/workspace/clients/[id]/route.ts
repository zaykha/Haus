import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import {
  canDeleteClient,
  canEditClient,
  getUserClientOrganizationIds,
} from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;
  const canManageClients = canEditClient(user.role);
  const isSelfClient = user.role === "client" && user.id === id;

  if (!canManageClients && !isSelfClient) {
    return NextResponse.json({ error: "You do not have permission to update this liaison" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    company?: string;
    clientOrganizationId?: string | null;
    addClientOrganizationId?: string | null;
    removeClientOrganizationId?: string | null;
    primaryClientOrganizationId?: string | null;
  };

  const nextName = body.name?.trim();
  if (!nextName) {
    return NextResponse.json({ error: "Liaison name is required" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.role !== "client") {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const requestedOrganizationIds = [
    body.clientOrganizationId ?? null,
    body.addClientOrganizationId ?? null,
    body.removeClientOrganizationId ?? null,
    body.primaryClientOrganizationId ?? null,
  ].filter((value): value is string => Boolean(value));

  if (!canManageClients && requestedOrganizationIds.length > 0) {
    return NextResponse.json(
      { error: "Clients cannot change their own organization memberships" },
      { status: 403 },
    );
  }

  const updatePayload: {
    name: string;
    company: string | null;
  } = {
    name: nextName,
    company: body.company?.trim() ? body.company.trim() : null,
  };

  const { error: updateError } = await supabase.from("profiles").update(updatePayload).eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (canManageClients && requestedOrganizationIds.length > 0) {
    const uniqueRequestedOrganizationIds = [...new Set(requestedOrganizationIds)];
    const { data: organizations, error: organizationsError } = await supabase
      .from("client_organizations")
      .select("id")
      .in("id", uniqueRequestedOrganizationIds);

    if (organizationsError) {
      return NextResponse.json({ error: organizationsError.message }, { status: 500 });
    }

    const existingOrganizationIds = new Set((organizations ?? []).map((organization) => organization.id));
    const missingOrganizationId = uniqueRequestedOrganizationIds.find(
      (organizationId) => !existingOrganizationIds.has(organizationId),
    );
    if (missingOrganizationId) {
      return NextResponse.json({ error: "Selected organization does not exist" }, { status: 400 });
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("client_organization_liaisons")
      .select("client_organization_id, is_primary")
      .eq("profile_id", id);

    if (membershipsError) {
      return NextResponse.json({ error: membershipsError.message }, { status: 500 });
    }

    const currentMembershipIds = new Set(
      (memberships ?? []).map((membership) => membership.client_organization_id),
    );
    const currentPrimaryOrganizationId =
      (memberships ?? []).find((membership) => membership.is_primary)?.client_organization_id ?? null;

    if (body.clientOrganizationId !== undefined) {
      if (body.clientOrganizationId) {
        const { error: liaisonError } = await supabase
          .from("client_organization_liaisons")
          .upsert(
            {
              profile_id: id,
              client_organization_id: body.clientOrganizationId,
              is_primary: true,
            },
            { onConflict: "profile_id,client_organization_id" },
          );

        if (liaisonError) {
          return NextResponse.json({ error: liaisonError.message }, { status: 500 });
        }

        const { error: demoteError } = await supabase
          .from("client_organization_liaisons")
          .update({ is_primary: false })
          .eq("profile_id", id)
          .neq("client_organization_id", body.clientOrganizationId);

        if (demoteError) {
          return NextResponse.json({ error: demoteError.message }, { status: 500 });
        }
      } else {
        const { error: deleteMembershipsError } = await supabase
          .from("client_organization_liaisons")
          .delete()
          .eq("profile_id", id);

        if (deleteMembershipsError) {
          return NextResponse.json({ error: deleteMembershipsError.message }, { status: 500 });
        }
      }
    }

    if (body.addClientOrganizationId) {
      const shouldPromotePrimary = currentMembershipIds.size === 0;
      const { error: addMembershipError } = await supabase
        .from("client_organization_liaisons")
        .upsert(
          {
            profile_id: id,
            client_organization_id: body.addClientOrganizationId,
            is_primary: shouldPromotePrimary,
          },
          { onConflict: "profile_id,client_organization_id" },
        );

      if (addMembershipError) {
        return NextResponse.json({ error: addMembershipError.message }, { status: 500 });
      }
    }

    if (body.primaryClientOrganizationId) {
      const { error: ensurePrimaryMembershipError } = await supabase
        .from("client_organization_liaisons")
        .upsert(
          {
            profile_id: id,
            client_organization_id: body.primaryClientOrganizationId,
            is_primary: true,
          },
          { onConflict: "profile_id,client_organization_id" },
        );

      if (ensurePrimaryMembershipError) {
        return NextResponse.json({ error: ensurePrimaryMembershipError.message }, { status: 500 });
      }

      const { error: demoteError } = await supabase
        .from("client_organization_liaisons")
        .update({ is_primary: false })
        .eq("profile_id", id)
        .neq("client_organization_id", body.primaryClientOrganizationId);

      if (demoteError) {
        return NextResponse.json({ error: demoteError.message }, { status: 500 });
      }
    }

    if (body.removeClientOrganizationId) {
      const removingPrimary =
        currentPrimaryOrganizationId === body.removeClientOrganizationId &&
        body.primaryClientOrganizationId !== body.removeClientOrganizationId;

      const { error: removeMembershipError } = await supabase
        .from("client_organization_liaisons")
        .delete()
        .eq("profile_id", id)
        .eq("client_organization_id", body.removeClientOrganizationId);

      if (removeMembershipError) {
        return NextResponse.json({ error: removeMembershipError.message }, { status: 500 });
      }

      if (removingPrimary) {
        const { data: remainingMemberships, error: remainingMembershipsError } = await supabase
          .from("client_organization_liaisons")
          .select("client_organization_id")
          .eq("profile_id", id)
          .order("created_at", { ascending: true })
          .limit(1);

        if (remainingMembershipsError) {
          return NextResponse.json({ error: remainingMembershipsError.message }, { status: 500 });
        }

        const nextPrimaryOrganizationId = remainingMemberships?.[0]?.client_organization_id ?? null;
        if (nextPrimaryOrganizationId) {
          const { error: promoteReplacementError } = await supabase
            .from("client_organization_liaisons")
            .update({ is_primary: true })
            .eq("profile_id", id)
            .eq("client_organization_id", nextPrimaryOrganizationId);

          if (promoteReplacementError) {
            return NextResponse.json({ error: promoteReplacementError.message }, { status: 500 });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;

  if (!canDeleteClient(user.role)) {
    return NextResponse.json({ error: "Only managers can delete clients" }, { status: 403 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.role !== "client") {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { error: deleteInvitationsError } = await supabase
    .from("invitations")
    .delete()
    .eq("email", profile.email)
    .eq("role", "client");

  if (deleteInvitationsError) {
    return NextResponse.json({ error: deleteInvitationsError.message }, { status: 500 });
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(id);
  if (deleteUserError) {
    return NextResponse.json({ error: deleteUserError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
