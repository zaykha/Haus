import type { CSSProperties } from "react";
import { ClientOrganization } from "@/lib/types";

const DEFAULT_BRAND_PRIMARY = "#1f4339";

export function normalizeHexColor(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    if (normalized.length === 4) {
      return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toUpperCase();
    }

    return normalized.toUpperCase();
  }

  return null;
}

export function getOrganizationBrandColor(organization?: Pick<ClientOrganization, "brandColor"> | null) {
  return normalizeHexColor(organization?.brandColor) ?? DEFAULT_BRAND_PRIMARY;
}

export function getClientBrandStyle(
  organization?: Pick<ClientOrganization, "brandColor"> | null,
) {
  const primary = getOrganizationBrandColor(organization);
  const softStart = hexToRgba(primary, 0.34);
  const softMid = hexToRgba(primary, 0.16);
  const softStrongStart = hexToRgba(primary, 0.46);
  const softStrongMid = hexToRgba(primary, 0.22);
  const softPanelStart = hexToRgba(primary, 0.2);
  const softPanelMid = hexToRgba(primary, 0.08);
  const textOnPrimary = getTextContrast(primary);

  return {
    "--client-brand-primary": primary,
    "--client-brand-soft": `linear-gradient(135deg, ${softStart} 0%, ${softMid} 42%, #FFFFFF 100%)`,
    "--client-brand-soft-strong": `linear-gradient(135deg, ${softStrongStart} 0%, ${softStrongMid} 46%, #FFFFFF 100%)`,
    "--client-brand-soft-panel": `linear-gradient(145deg, ${softPanelStart} 0%, ${softPanelMid} 56%, #FFFFFF 100%)`,
    "--client-brand-on-primary": textOnPrimary,
  } as CSSProperties;
}

function mixHexWithWhite(hex: string, amount: number) {
  const color = hexToRgb(hex);
  const next = {
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount),
  };

  return rgbToHex(next.r, next.g, next.b);
}

function getTextContrast(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.64 ? "#1F1F1F" : "#FFFFFF";
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_BRAND_PRIMARY;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
