"use client";

import { FormEvent, useEffect, useState } from "react";
import styled, { css } from "styled-components";
import { User } from "@/lib/types";

const tabletUp = "@media (min-width: 640px)";
const desktop = "@media (min-width: 1100px)";
const categoryOptions = [
  "Brand Identity",
  "Packaging Design",
  "Website Design",
  "Campaign",
  "Custom",
] as const;
const DESCRIPTION_WORD_LIMIT = 60;

export type ProjectFormValues = {
  name: string;
  description: string;
  category: string;
  dueDate: string;
  clientId: string;
};

type ProjectFormProps = {
  initialValues: ProjectFormValues;
  clients: User[];
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  onCancel?: () => void;
  hideActions?: boolean;
  onValuesChange?: (values: ProjectFormValues) => void;
};

function getProjectInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

function limitWords(value: string, limit: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) {
    return value;
  }

  return words.slice(0, limit).join(" ");
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function ProjectForm({
  initialValues,
  clients,
  submitLabel,
  onSubmit,
  onCancel,
  hideActions = false,
  onValuesChange,
}: ProjectFormProps) {
  const [values, setValues] = useState<ProjectFormValues>(initialValues);
  const [openSelect, setOpenSelect] = useState<"category" | "client" | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const isBuiltInCategory = categoryOptions.includes(
      initialValues.category as (typeof categoryOptions)[number],
    );

    setValues({
      ...initialValues,
      category: isBuiltInCategory ? initialValues.category : "Custom",
    });
    setCustomCategory(isBuiltInCategory ? "" : initialValues.category);
  }, [initialValues]);

  useEffect(() => {
    onValuesChange?.({
      ...values,
      category: values.category === "Custom" ? customCategory.trim() : values.category,
    });
  }, [customCategory, onValuesChange, values]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit({
        ...values,
        category: values.category === "Custom" ? customCategory.trim() : values.category,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save project.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {submitting ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>{submitLabel === "Create Project" ? "Creating project..." : "Saving project..."}</p>
          </div>
        </div>
      ) : null}

      <FormSurface onSubmit={handleSubmit}>
       <PreviewRow>
        <PreviewBadge>{getProjectInitial(values.name)}</PreviewBadge>
        <PreviewCopy>
          <PreviewTitle>{values.name || "Project title"}</PreviewTitle>
        </PreviewCopy>
      </PreviewRow>

        <Grid>
          <Field $wide>
            <FloatingField className={values.name ? "auth-field is-filled" : "auth-field"}>
              <TextInput
                value={values.name}
                onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                placeholder=" "
                required
              />
              <span>Project title</span>
            </FloatingField>
          </Field>

          <Field>
            <FloatingSelectField $filled $open={openSelect === "category"}>
              <SelectTrigger
                type="button"
                aria-haspopup="listbox"
                aria-expanded={openSelect === "category"}
                onClick={() =>
                  setOpenSelect((current) => (current === "category" ? null : "category"))
                }
              >
                <SelectValue>
                  {values.category === "Custom" ? customCategory || "Custom" : values.category}
                </SelectValue>
                <SelectChevron $open={openSelect === "category"}>
                  <IconChevronDown />
                </SelectChevron>
              </SelectTrigger>
              <FloatingLabel>Category</FloatingLabel>
              {openSelect === "category" ? (
                <SelectMenu role="listbox" aria-label="Category">
                  {categoryOptions.map((option) => (
                    <SelectOption
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={values.category === option}
                      $active={values.category === option}
                      onClick={() => {
                        setValues((current) => ({ ...current, category: option }));
                        if (option !== "Custom") {
                          setCustomCategory("");
                        }
                        setOpenSelect(null);
                      }}
                    >
                      {option}
                    </SelectOption>
                  ))}
                </SelectMenu>
              ) : null}
            </FloatingSelectField>
          </Field>

          {values.category === "Custom" ? (
            <Field>
              <FloatingField className={customCategory ? "auth-field is-filled" : "auth-field"}>
                <TextInput
                  value={customCategory}
                  onChange={(event) => setCustomCategory(event.target.value)}
                  placeholder=" "
                  required
                />
                <span>Custom category</span>
              </FloatingField>
            </Field>
          ) : null}

          <Field $wide>
            <FloatingTextAreaField $filled={Boolean(values.description)}>
              <TextArea
                value={values.description}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    description: limitWords(event.target.value, DESCRIPTION_WORD_LIMIT),
                  }))
                }
                rows={4}
                placeholder=" "
                required
              />
              <FloatingLabel>Description</FloatingLabel>
            </FloatingTextAreaField>
            <FieldMeta>
              {countWords(values.description)} / {DESCRIPTION_WORD_LIMIT} words
            </FieldMeta>
          </Field>

          <Field>
            <FloatingField className={values.dueDate ? "auth-field is-filled" : "auth-field"}>
              <TextInput
                type="date"
                value={values.dueDate}
                onChange={(event) =>
                  setValues((current) => ({ ...current, dueDate: event.target.value }))
                }
                placeholder=" "
                required
              />
              <span>Due date</span>
            </FloatingField>
          </Field>

          <Field>
            <FloatingSelectField $filled $open={openSelect === "client"}>
              <SelectTrigger
                type="button"
                aria-haspopup="listbox"
                aria-expanded={openSelect === "client"}
                onClick={() => setOpenSelect((current) => (current === "client" ? null : "client"))}
              >
                <SelectValue>
                  {clients.find((client) => client.id === values.clientId)?.name ?? "Unassigned for now"}
                </SelectValue>
                <SelectChevron $open={openSelect === "client"}>
                  <IconChevronDown />
                </SelectChevron>
              </SelectTrigger>
              <FloatingLabel>Client</FloatingLabel>
              {openSelect === "client" ? (
                <SelectMenu role="listbox" aria-label="Client">
                  <SelectOption
                    type="button"
                    role="option"
                    aria-selected={!values.clientId}
                    $active={!values.clientId}
                    onClick={() => {
                      setValues((current) => ({ ...current, clientId: "" }));
                      setOpenSelect(null);
                    }}
                  >
                    Unassigned for now
                  </SelectOption>
                  {clients.map((client) => (
                    <SelectOption
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={values.clientId === client.id}
                      $active={values.clientId === client.id}
                      onClick={() => {
                        setValues((current) => ({ ...current, clientId: client.id }));
                        setOpenSelect(null);
                      }}
                    >
                      {client.name}
                    </SelectOption>
                  ))}
                </SelectMenu>
              ) : null}
            </FloatingSelectField>
          </Field>
        </Grid>

        {hideActions ? null : (
          <Actions>
            {onCancel ? (
              <GhostButton type="button" onClick={onCancel}>
                Cancel
              </GhostButton>
            ) : null}
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? "Saving..." : submitLabel}
            </PrimaryButton>
          </Actions>
        )}
        {error ? <InlineError>{error}</InlineError> : null}
      </FormSurface>
    </>
  );
}

const surfaceCss = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow-sm);
`;

const controlCss = css`
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: none;
  box-sizing: border-box;

  ${tabletUp} {
    min-height: 52px;
    padding: 0 14px;
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
  }
`;

const FormSurface = styled.form`
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow-x: hidden;

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  ${tabletUp} {
    ${surfaceCss}
    gap: 14px;
    padding: 14px;
    border-radius: 20px;
  }

  ${desktop} {
    gap: 18px;
    padding: 18px;
    border-radius: 24px;
  }
`;

const PreviewRow = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(230, 224, 215, 0.72);
  border-radius: 16px;
  background: rgba(251, 250, 247, 0.76);

  ${tabletUp} {
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
  }
`;

const PreviewBadge = styled.div`
  width: 38px;
  height: 38px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #ece4d8, #d8c8b6);
  color: #6f5637;
  font-size: 1rem;
  font-weight: 800;

  ${tabletUp} {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    font-size: 1.25rem;
  }
`;

const Grid = styled.div`
  display: grid;
  gap: 10px;

  ${tabletUp} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
`;

const TextInput = styled.input`
  ${controlCss}
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 48px;
  padding: 0 12px;
  font-size: 16px;
  box-sizing: border-box;
  overflow: hidden;

  &[type="date"] {
    appearance: none;
    -webkit-appearance: none;
    min-width: 0;
    max-width: 100%;
    text-align: left;
  }

  &[type="date"]::-webkit-date-and-time-value {
    text-align: left;
    min-width: 0;
  }

  &[type="date"]::-webkit-calendar-picker-indicator {
    margin-left: 4px;
  }

  ${tabletUp} {
    min-height: 52px;
    padding: 0 14px;
  }
`;

const SelectTrigger = styled.button`
  ${controlCss}
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  min-height: 48px;
  padding: 16px 12px 9px;
  font-size: 16px;
  text-align: left;

  ${tabletUp} {
    min-height: 52px;
    padding: 18px 14px 10px;
  }
`;

const TextArea = styled.textarea`
  ${controlCss}
  min-height: 92px;
  height: 92px;
  padding: 22px 12px 12px;
  resize: none;
  font-size: 16px;
  line-height: 1.42;

  ${tabletUp} {
    min-height: 112px;
    height: 112px;
    padding: 24px 14px 14px;
  }

  ${desktop} {
    min-height: 132px;
    height: 132px;
    padding: 24px 16px 16px;
  }
`;

const SelectMenu = styled.div`
  ${surfaceCss}
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border-radius: 16px;
  max-height: 190px;
  overflow-y: auto;
  z-index: 20;

  ${tabletUp} {
    top: calc(100% + 8px);
    padding: 8px;
    border-radius: 18px;
    max-height: 240px;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;

  @media (max-width: 639px) {
    display: grid;
    grid-template-columns: 1fr;
  }
`;

const PreviewCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PreviewTitle = styled.strong`
  display: block;
  min-width: 0;
  color: #2e2a27;
  font-size: 0.92rem;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${tabletUp} {
    font-size: 1rem;
  }
`;

const PreviewMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.86rem;
  line-height: 1.45;
`;



const Field = styled.label<{ $wide?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  // overflow: hidden;

  ${({ $wide }) =>
    $wide
      ? css`
          ${tabletUp} {
            grid-column: 1 / -1;
          }
        `
      : ""}
`;

const SectionLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const FieldMeta = styled.span`
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.2;
`;

const FloatingField = styled.label`
  width: 100%;
`;

const FloatingSelectField = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const FloatingTextAreaField = styled.div<{ $filled?: boolean }>`
  position: relative;
  width: 100%;

  ${({ $filled }) =>
    $filled
      ? css`
          textarea + span {
            top: 1px;
            transform: translateY(-50%);
            font-size: 13px;
            color: #29463e;
            font-weight: 500;
          }
        `
      : ""}

  &:focus-within textarea + span {
    top: 1px;
    transform: translateY(-50%);
    font-size: 13px;
    color: #29463e;
    font-weight: 500;
  }
`;

const FloatingLabel = styled.span`
  position: absolute;
  left: 12px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #29463e;
  font-size: 12px;
  font-weight: 600;
  z-index: 3;
  pointer-events: none;

  ${tabletUp} {
    left: 16px;
    font-size: 13px;
    font-weight: 500;
  }
`;

const SelectValue = styled.span`
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.2;
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

  &:hover {
    background: rgba(31, 67, 57, 0.08);
  }
`;

const GhostButton = styled.button`
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 600;
`;

const PrimaryButton = styled.button`
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #1f4339;
  color: #fff;
  font-size: 0.84rem;
  font-weight: 700;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.82rem;
`;

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
