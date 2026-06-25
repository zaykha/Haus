"use client";

import { ChangeEvent } from "react";
import styled from "styled-components";
import { normalizeHexColor } from "@/lib/client-branding";

const brandSwatches = [
  "#1F4339",
  "#274B7A",
  "#8A5A16",
  "#8E3B46",
  "#5A4B8A",
  "#A14F2B",
  "#2C6B43",
  "#3E6670",
] as const;

type BrandColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
};

export function BrandColorPicker({
  value,
  onChange,
  disabled = false,
  label = "Brand color",
  helperText = "Pick a darker primary tone. The softer background tone is derived automatically.",
}: BrandColorPickerProps) {
  const normalizedValue = normalizeHexColor(value) ?? brandSwatches[0];

  const handleHexChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value.toUpperCase());
  };

  const handleHexBlur = () => {
    onChange(normalizeHexColor(value) ?? normalizedValue);
  };

  return (
    <Wrapper>
      <FieldHeader>
        <FieldLabel>{label}</FieldLabel>
        <FieldHelper>{helperText}</FieldHelper>
      </FieldHeader>

      <PreviewRow>
        <ColorPreview style={{ background: normalizedValue }} />
        <HexInput
          value={value}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          disabled={disabled}
          spellCheck={false}
          maxLength={7}
          placeholder="#1F4339"
        />
      </PreviewRow>

      <SwatchGrid role="listbox" aria-label={label}>
        {brandSwatches.map((swatch) => {
          const active = normalizedValue === swatch;
          return (
            <SwatchButton
              key={swatch}
              type="button"
              role="option"
              aria-selected={active}
              $active={active}
              disabled={disabled}
              onClick={() => onChange(swatch)}
            >
              <SwatchFill style={{ background: swatch }} />
            </SwatchButton>
          );
        })}
      </SwatchGrid>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: grid;
  gap: 12px;
`;

const FieldHeader = styled.div`
  display: grid;
  gap: 4px;
`;

const FieldLabel = styled.span`
  color: #7f7468;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const FieldHelper = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.82rem;
  line-height: 1.45;
`;

const PreviewRow = styled.div`
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
`;

const ColorPreview = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  box-shadow: 0 10px 22px rgba(31, 31, 31, 0.08);
`;

const HexInput = styled.input`
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text);
  font-size: 0.94rem;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
  text-transform: uppercase;
`;

const SwatchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(42px, 1fr));
  gap: 10px;
`;

const SwatchButton = styled.button<{ $active?: boolean }>`
  padding: 5px;
  border: 1px solid
    ${({ $active }) => ($active ? "rgba(47, 93, 80, 0.48)" : "rgba(230, 224, 215, 0.95)")};
  border-radius: 14px;
  background: ${({ $active }) => ($active ? "rgba(230, 240, 236, 0.92)" : "rgba(255, 255, 255, 0.96)")};
  box-shadow: ${({ $active }) =>
    $active ? "0 0 0 3px rgba(47, 93, 80, 0.12)" : "0 10px 22px rgba(31, 31, 31, 0.06)"};
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 28px rgba(31, 31, 31, 0.1);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const SwatchFill = styled.span`
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
`;
