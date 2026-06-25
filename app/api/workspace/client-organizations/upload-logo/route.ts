import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { appConfig } from "@/lib/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function isAllowedImage(file: File) {
  return allowedMimeTypes.includes(file.type);
}

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client is not configured" }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Organization logo is required" }, { status: 400 });
  }

  if (!isAllowedImage(file)) {
    return NextResponse.json({ error: "Unsupported logo type. Use PNG, JPG, or WebP." }, { status: 400 });
  }

  const bucket = appConfig.organizationProfileImagesBucket;
  const existingBuckets = await supabase.storage.listBuckets();
  if (!existingBuckets.data?.some((candidate) => candidate.name === bucket)) {
    const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 6 * 1024 * 1024,
      allowedMimeTypes,
    });

    if (createBucketError && !createBucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: createBucketError.message }, { status: 500 });
    }
  }

  const extension = (file.name.split(".").pop() ?? "webp").toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `organizations/${Date.now()}-${crypto.randomUUID()}-${safeName || `logo.${extension}`}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
