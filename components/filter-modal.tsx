"use client";

import { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";

type FilterOption = {
  value: string;
  label: string;
};

type FilterSection = {
  id: string;
  label: string;
  options: FilterOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function FilterModal({
  open,
  title,
  description,
  sections,
  values,
  onApply,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  sections: FilterSection[];
  values: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>(values);
  const [openSelect, setOpenSelect] = useState<string | null>(null);
  const [searchValues, setSearchValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftValues(values);
    setOpenSelect(null);
    setSearchValues({});
  }, [open, values]);

  const labelsBySection = useMemo(
    () =>
      Object.fromEntries(
        sections.map((section) => [
          section.id,
          section.options.find((option) => option.value === draftValues[section.id])?.label ?? "Select",
        ]),
      ),
    [draftValues, sections],
  );
  const filteredOptionsBySection = useMemo(
    () =>
      Object.fromEntries(
        sections.map((section) => {
          const searchValue = searchValues[section.id]?.trim().toLowerCase() ?? "";
          const filteredOptions = searchValue
            ? section.options.filter((option) => option.label.toLowerCase().includes(searchValue))
            : section.options;
          return [section.id, filteredOptions];
        }),
      ),
    [searchValues, sections],
  );

  if (!open) {
    return null;
  }

  return (
    <Backdrop onClick={onClose}>
      <Panel $menuOpen={Boolean(openSelect)} onClick={(event) => event.stopPropagation()}>
        <Header>
          <div>
            <Title>{title}</Title>
            {description ? <Description>{description}</Description> : null}
          </div>
          <CloseButton type="button" onClick={onClose} aria-label="Close filters">
            <IconClose />
          </CloseButton>
        </Header>

        <Body $menuOpen={Boolean(openSelect)}>
          {sections.map((section) => (
            <Section key={section.id}>
              <SelectField $open={openSelect === section.id}>
                <SelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={openSelect === section.id}
                  onClick={() =>
                    setOpenSelect((current) => (current === section.id ? null : section.id))
                  }
                >
                  <SelectValue>{labelsBySection[section.id]}</SelectValue>
                  <SelectChevron $open={openSelect === section.id}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectTrigger>
                <SelectLabel>{section.label}</SelectLabel>
                {openSelect === section.id ? (
                  <SelectMenu role="listbox" aria-label={section.label}>
                    {section.searchable ? (
                      <SearchInput
                        value={searchValues[section.id] ?? ""}
                        onChange={(event) =>
                          setSearchValues((current) => ({
                            ...current,
                            [section.id]: event.target.value,
                          }))
                        }
                        placeholder={section.searchPlaceholder ?? `Search ${section.label.toLowerCase()}...`}
                      />
                    ) : null}
                    {(filteredOptionsBySection[section.id] as FilterOption[]).length ? (
                      (filteredOptionsBySection[section.id] as FilterOption[]).map((option) => (
                        <SelectOption
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={draftValues[section.id] === option.value}
                          $active={draftValues[section.id] === option.value}
                          onClick={() => {
                            setDraftValues((current) => ({
                              ...current,
                              [section.id]: option.value,
                            }));
                            setOpenSelect(null);
                            setSearchValues((current) => ({
                              ...current,
                              [section.id]: "",
                            }));
                          }}
                        >
                          {option.label}
                        </SelectOption>
                      ))
                    ) : (
                      <EmptyState>No matches found</EmptyState>
                    )}
                  </SelectMenu>
                ) : null}
              </SelectField>
            </Section>
          ))}
        </Body>

        <Footer $menuOpen={Boolean(openSelect)}>
          <GhostButton
            type="button"
            onClick={() => {
              setDraftValues(values);
              setOpenSelect(null);
              setSearchValues({});
            }}
          >
            Reset
          </GhostButton>
          <PrimaryButton
            type="button"
            onClick={() => {
              onApply(draftValues);
              onClose();
            }}
          >
            Apply filters
          </PrimaryButton>
        </Footer>
      </Panel>
    </Backdrop>
  );
}

const surfaceCss = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow-md);
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);

  @media (min-width: 768px) {
    padding: 18px;
  }
`;

const Panel = styled.section<{ $menuOpen?: boolean }>`
  ${surfaceCss}
  width: min(100%, 460px);
  min-height: auto;
  max-height: min(640px, calc(100dvh - 28px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: ${({ $menuOpen }) => ($menuOpen ? "visible" : "hidden")};
  border-radius: 24px;

  @media (min-width: 768px) {
    width: min(100%, 520px);
    max-height: calc(100dvh - 36px);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid rgba(230, 224, 215, 0.82);
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1rem;
`;

const Description = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
`;

const CloseButton = styled.button`
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 44px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);

  svg {
    width: 20px;
    height: 20px;
  }
`;

const Body = styled.div<{ $menuOpen?: boolean }>`
  min-height: 0;
  overflow-y: ${({ $menuOpen }) => ($menuOpen ? "visible" : "auto")};
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px 18px;
  position: relative;
  z-index: 3;
`;

const Section = styled.div`
  display: grid;
  gap: 10px;
`;

const SelectField = styled.div<{ $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const SelectTrigger = styled.button`
  width: 100%;
  min-height: 52px;
  padding: 18px 14px 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
`;

const SelectValue = styled.span`
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.2;
`;

const SelectLabel = styled.span`
  position: absolute;
  left: 16px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #29463e;
  font-size: 13px;
  font-weight: 500;
  z-index: 3;
  pointer-events: none;
`;

const SelectChevron = styled.span<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transform: rotate(${({ $open }) => ($open ? "180deg" : "0deg")});
  transition: transform 140ms ease;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const SelectMenu = styled.div`
  ${surfaceCss}
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 20;
`;

const SearchInput = styled.input`
  width: 100%;
  min-height: 44px;
  margin-bottom: 6px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: rgba(248, 244, 238, 0.92);
  color: var(--color-text);
  font: inherit;

  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const SelectOption = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: ${({ $active }) => ($active ? "rgba(31, 67, 57, 0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "#1f4339" : "var(--color-text)")};
  font-size: 0.94rem;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  text-align: left;
`;

const EmptyState = styled.div`
  padding: 14px 12px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  text-align: center;
`;

const Footer = styled.div<{ $menuOpen?: boolean }>`
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr;
  padding: 14px 18px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.82);
  background: rgba(255, 255, 255, 0.98);
  position: relative;
  z-index: ${({ $menuOpen }) => ($menuOpen ? 1 : 2)};

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const GhostButton = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 700;
`;

const PrimaryButton = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: #1f4339;
  color: #fff;
  font-size: 0.84rem;
  font-weight: 700;
`;

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  );
}
