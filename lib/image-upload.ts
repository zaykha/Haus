import { appMode } from "@/lib/config";

const DEFAULT_MAX_IMAGE_DIMENSION = 1600;

export async function optimizeImageToWebp(
  file: File,
  options?: { maxDimension?: number; quality?: number },
) {
  const sourceUrl = await fileToDataUrl(file);
  const image = await loadImage(sourceUrl);
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_IMAGE_DIMENSION;
  const quality = options?.quality ?? 0.82;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for image processing.");
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );

  if (!blob) {
    throw new Error("Unable to optimize image.");
  }

  return blob;
}

export async function uploadOptimizedImage(blob: Blob, fileNamePrefix = "upload") {
  if (appMode !== "supabase") {
    return blobToDataUrl(blob);
  }

  const formData = new FormData();
  formData.append("file", blob, `${fileNamePrefix}-${Date.now()}.webp`);

  const response = await fetch("/api/projects/upload-image", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to upload image.");
  }

  const payload = (await response.json()) as { url: string };
  return payload.url;
}

export function blobToDataUrl(blob: Blob) {
  return fileToDataUrl(blob);
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}
