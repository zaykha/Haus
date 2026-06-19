import { ClientOrganizationDetailScreen } from "@/components/client-organization-detail-screen";

export default async function ClientOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientOrganizationDetailScreen organizationId={id} />;
}
