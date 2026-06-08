"use client";

import { FormEvent, useEffect, useState } from "react";
import styled, { css } from "styled-components";
import { User } from "@/lib/types";

const desktop = "@media (min-width: 768px)";

export type ProjectFormValues = {
  name: string;
  imageUrl: string;
  description: string;
  category: string;
  dueDate: string;
  clientId: string;
  staffIds: string[];
};

type ProjectFormProps = {
  initialValues: ProjectFormValues;
  clients: User[];
  staff: User[];
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  onCancel?: () => void;
};

function getProjectInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

export function ProjectForm({
  initialValues,
  clients,
  staff,
  submitLabel,
  onSubmit,
  onCancel,
}: ProjectFormProps) {
  const [values, setValues] = useState<ProjectFormValues>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const toggleStaff = (staffId: string) => {
    setValues((current) => ({
      ...current,
      staffIds: current.staffIds.includes(staffId)
        ? current.staffIds.filter((candidate) => candidate !== staffId)
        : [...current.staffIds, staffId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <FormSurface onSubmit={handleSubmit}>
      <PreviewRow>
        <PreviewBadge $imageUrl={values.imageUrl.trim() || null}>
          {values.imageUrl.trim() ? null : getProjectInitial(values.name)}
        </PreviewBadge>
        <PreviewCopy>
          <PreviewTitle>{values.name || "Project title"}</PreviewTitle>
          <PreviewMeta>Project avatar uses the uploaded image or the first title letter.</PreviewMeta>
        </PreviewCopy>
      </PreviewRow>

      <Grid>
        <Field $wide>
          <FieldLabel>Project title</FieldLabel>
          <TextInput
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            placeholder="Kumo Coffee Logo Design"
            required
          />
        </Field>

        <Field>
          <FieldLabel>Profile image URL</FieldLabel>
          <TextInput
            value={values.imageUrl}
            onChange={(event) =>
              setValues((current) => ({ ...current, imageUrl: event.target.value }))
            }
            placeholder="https://..."
          />
        </Field>

        <Field>
          <FieldLabel>Category</FieldLabel>
          <TextSelect
            value={values.category}
            onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}
          >
            <option>Brand Identity</option>
            <option>Packaging Design</option>
            <option>Website Design</option>
            <option>Campaign</option>
          </TextSelect>
        </Field>

        <Field $wide>
          <FieldLabel>Description</FieldLabel>
          <TextArea
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
            rows={4}
            required
          />
        </Field>

        <Field>
          <FieldLabel>Due date</FieldLabel>
          <TextInput
            type="date"
            value={values.dueDate}
            onChange={(event) => setValues((current) => ({ ...current, dueDate: event.target.value }))}
            required
          />
        </Field>

        <Field>
          <FieldLabel>Client</FieldLabel>
          <TextSelect
            value={values.clientId}
            onChange={(event) => setValues((current) => ({ ...current, clientId: event.target.value }))}
            required
          >
            <option value="" disabled>
              Select client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </TextSelect>
        </Field>

        <Field $wide>
          <FieldLabel>Assigned staff</FieldLabel>
          <StaffGrid>
            {staff.map((member) => (
              <StaffOption key={member.id} $active={values.staffIds.includes(member.id)}>
                <input
                  type="checkbox"
                  checked={values.staffIds.includes(member.id)}
                  onChange={() => toggleStaff(member.id)}
                />
                <StaffAvatar>{member.name.slice(0, 1).toUpperCase()}</StaffAvatar>
                <div>
                  <StaffName>{member.name}</StaffName>
                  <StaffMeta>{member.email}</StaffMeta>
                </div>
              </StaffOption>
            ))}
          </StaffGrid>
        </Field>
      </Grid>

      <Actions>
        {onCancel ? (
          <GhostButton type="button" onClick={onCancel}>
            Cancel
          </GhostButton>
        ) : null}
        <PrimaryButton type="submit">{submitLabel}</PrimaryButton>
      </Actions>
    </FormSurface>
  );
}

const surfaceCss = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow-sm);
`;

const controlCss = css`
  width: 100%;
  min-height: 52px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
`;

const FormSurface = styled.form`
  ${surfaceCss}
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
  border-radius: 24px;
`;

const PreviewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const PreviewBadge = styled.div<{ $imageUrl: string | null }>`
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background:
    ${({ $imageUrl }) =>
      $imageUrl
        ? `center / cover no-repeat url("${$imageUrl}")`
        : "linear-gradient(180deg, #ece4d8, #d8c8b6)"};
  color: ${({ $imageUrl }) => ($imageUrl ? "transparent" : "#6f5637")};
  font-size: 1.8rem;
  font-weight: 700;
`;

const PreviewCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PreviewTitle = styled.strong`
  font-size: 1rem;
`;

const PreviewMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.86rem;
  line-height: 1.45;
`;

const Grid = styled.div`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const Field = styled.label<{ $wide?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${({ $wide }) =>
    $wide
      ? css`
          ${desktop} {
            grid-column: 1 / -1;
          }
        `
      : ""}
`;

const FieldLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const TextInput = styled.input`
  ${controlCss}
`;

const TextSelect = styled.select`
  ${controlCss}
`;

const TextArea = styled.textarea`
  ${controlCss}
  min-height: 120px;
  padding: 14px;
  resize: vertical;
`;

const StaffGrid = styled.div`
  display: grid;
  gap: 10px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const StaffOption = styled.label<{ $active: boolean }>`
  ${surfaceCss}
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  box-shadow: ${({ $active }) =>
    $active ? "inset 0 0 0 1px rgba(31, 68, 57, 0.2), var(--shadow-sm)" : "var(--shadow-sm)"};
  background: ${({ $active }) => ($active ? "#f5efe5" : "rgba(255, 255, 255, 0.94)")};

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
`;

const StaffAvatar = styled.span`
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
`;

const StaffName = styled.strong`
  display: block;
  font-size: 0.92rem;
`;

const StaffMeta = styled.p`
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const GhostButton = styled.button`
  min-height: 46px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 600;
`;

const PrimaryButton = styled.button`
  min-height: 46px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: #1f4339;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
`;
