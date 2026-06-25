import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { appConfig } from "@/lib/config";

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const maxFileSize = 10 * 1024 * 1024;

function getFileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (!allowedMimeTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPG, or WEBP." },
      { status: 400 },
    );
  }

  if (file.size > maxFileSize) {
    return NextResponse.json(
      { error: "Image must be 10MB or smaller." },
      { status: 400 },
    );
  }

  const bucket = appConfig.chatImagesBucket;
  const existingBuckets = await supabase.storage.listBuckets();
  if (!existingBuckets.data?.some((candidate) => candidate.name === bucket)) {
    const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: maxFileSize,
      allowedMimeTypes,
    });

    if (createBucketError && !createBucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: createBucketError.message }, { status: 500 });
    }
  }

  const extension = getFileExtension(file.name) || "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `messages/${user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName || `image.${extension}`}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({
    url: data.publicUrl,
    name: file.name,
    mimeType: file.type,
  });
}
