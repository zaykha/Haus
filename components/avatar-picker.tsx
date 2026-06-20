"use client";

import styled from "styled-components";
import { getProfileAvatarLabel, profileAvatarOptions } from "@/lib/profile-avatars";

type AvatarPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
};

export function AvatarPicker({
  value,
  onChange,
  disabled = false,
  label = "Profile avatar",
  helperText = "Choose an avatar for your profile.",
}: AvatarPickerProps) {
  return (
    <Wrapper>
      <FieldHeader>
        <FieldLabel>{label}</FieldLabel>
        <FieldHelper>{helperText}</FieldHelper>
      </FieldHeader>
      <AvatarGrid role="listbox" aria-label={label}>
        {profileAvatarOptions.map((option) => {
          const active = value === option;
          return (
            <AvatarOption
              key={option}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={getProfileAvatarLabel(option)}
              $active={active}
              disabled={disabled}
              onClick={() => onChange(option)}
            >
              <AvatarImage src={option} alt={getProfileAvatarLabel(option)} />
            </AvatarOption>
          );
        })}
      </AvatarGrid>
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
  font-size: 0.86rem;
  line-height: 1.45;
`;

const AvatarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
  gap: 10px;
`;

const AvatarOption = styled.button<{ $active?: boolean }>`
  border: 1px solid
    ${({ $active }) => ($active ? "rgba(47, 93, 80, 0.48)" : "rgba(230, 224, 215, 0.95)")};
  border-radius: 18px;
  background: ${({ $active }) => ($active ? "rgba(230, 240, 236, 0.92)" : "rgba(255, 255, 255, 0.96)")};
  box-shadow: ${({ $active }) =>
    $active ? "0 0 0 3px rgba(47, 93, 80, 0.12)" : "0 10px 22px rgba(31, 31, 31, 0.06)"};
  padding: 8px;
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

const AvatarImage = styled.img`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
  display: block;
  object-fit: cover;
  background: #f7f1e8;
`;
