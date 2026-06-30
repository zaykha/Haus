"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  defaultProfileAvatarPath,
  getProfileAvatarGroupId,
  getProfileAvatarLabel,
  profileAvatarGroups,
} from "@/lib/profile-avatars";

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
  const [activeGroupId, setActiveGroupId] = useState(() => getProfileAvatarGroupId(value || defaultProfileAvatarPath));
  const activeGroup =
    profileAvatarGroups.find((group) => group.id === activeGroupId) ?? profileAvatarGroups[0];

  useEffect(() => {
    setActiveGroupId(getProfileAvatarGroupId(value || defaultProfileAvatarPath));
  }, [value]);

  return (
    <Wrapper>
      <FieldHeader>
        <FieldLabel>{label}</FieldLabel>
        <FieldHelper>{helperText}</FieldHelper>
      </FieldHeader>
      <TabList role="tablist" aria-label={`${label} library`}>
        {profileAvatarGroups.map((group) => (
          <TabButton
            key={group.id}
            type="button"
            role="tab"
            aria-selected={activeGroup?.id === group.id}
            $active={activeGroup?.id === group.id}
            disabled={disabled}
            onClick={() => {
              setActiveGroupId(group.id);
              if (!group.options.includes(value) && group.options[0]) {
                onChange(group.options[0]);
              }
            }}
          >
            {group.label}
          </TabButton>
        ))}
      </TabList>
      <AvatarGrid role="listbox" aria-label={label}>
        {activeGroup.options.map((option) => {
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

const TabList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const TabButton = styled.button<{ $active?: boolean }>`
  min-height: 34px;
  border: 1px solid
    ${({ $active }) => ($active ? "rgba(47, 93, 80, 0.42)" : "rgba(230, 224, 215, 0.95)")};
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "rgba(230, 240, 236, 0.96)" : "rgba(255, 255, 255, 0.92)")};
  color: ${({ $active }) => ($active ? "#2f5d50" : "#6f6a63")};
  padding: 0 12px;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
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
