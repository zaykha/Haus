import { appMode } from "@/lib/config";

export async function uploadOrganizationLogo(file: File) {
  if (appMode !== "supabase") {
    return URL.createObjectURL(file);
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/workspace/client-organizations/upload-logo", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to upload organization logo.");
  }

  const payload = (await response.json()) as { url: string };
  return payload.url;
}
