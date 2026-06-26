import { appMode } from "@/lib/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Missing authenticated session");
  }

  return token;
}

export async function uploadOrganizationLogo(file: File) {
  if (appMode !== "supabase") {
    return URL.createObjectURL(file);
  }

  const token = await getAccessToken();

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/workspace/client-organizations/upload-logo", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to upload organization logo.");
  }

  const payload = (await response.json()) as { url: string };
  return payload.url;
}
