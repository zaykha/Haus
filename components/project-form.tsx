"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { getUserClientOrganizationIds } from "@/lib/permissions";
import { uploadProjectReference } from "@/lib/reference-upload";
import { ClientOrganization, Department, User } from "@/lib/types";

const tabletUp = "@media (min-width: 640px)";
const desktop = "@media (min-width: 1100px)";
const requestStatusOptions = [
  "Waiting List",
  "WIP",
  "Pending Review",
  "Complete",
  "On Hold",
] as const;
const projectTypeOptions = [
  "Brand Identity",
  "Packaging Design",
  "Website Design",
  "Campaign",
  "Corporate Admin",
  "KV (Key Visual)",
  "Packaging",
  "Prints",
  "Digital",
  "Social Media",
  "Web / UI-UX",
  "Motion",
  "Production",
  "Event",
  "POSM",
  "OOH",
  "Branding & Logo",
  "Strategy / Copy",
  "Others",
  "Custom",
] as const;
const priorityLevelOptions = ["Low", "Medium", "High", "Urgent"] as const;
const DESCRIPTION_WORD_LIMIT = 120;

export type ProjectFormValues = {
  requestedDate: string;
  requestStatus: string;
  departmentName: string;
  projectRequestName: string;
  contactPerson: string;
  contactNumber: string;
  projectType: string;
  priorityLevel: string;
  firstDraftDate: string;
  finalDeliverableDate: string;
  projectObjective: string;
  projectBrief: string;
  creativeAdvice: string;
  description: string;
  referenceAttachmentUrl: string;
  clientOrganizationId: string;
};

type ProjectFormProps = {
  initialValues: ProjectFormValues;
  departments: Department[];
  clientOrganizations: ClientOrganization[];
  clients: User[];
  viewer?: Pick<User, "role" | "name" | "phone" | "department"> | null;
  clientCreateMode?: boolean;
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  onCancel?: () => void;
  hideActions?: boolean;
  onValuesChange?: (values: ProjectFormValues) => void;
  embedded?: boolean;
  autoCreateTask?: boolean;
  onAutoCreateTaskChange?: (value: boolean) => void;
  showAutoCreateTaskToggle?: boolean;
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

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getReferenceLabel(value: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? value;
    return decodeURIComponent(lastSegment);
  } catch {
    return value;
  }
}

function parseReferenceAttachments(value: string) {
  if (!value.trim()) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    return [value];
  }

  return [value];
}

function serializeReferenceAttachments(urls: string[]) {
  const sanitized = urls.map((url) => url.trim()).filter(Boolean);
  if (sanitized.length === 0) {
    return "";
  }

  if (sanitized.length === 1) {
    return sanitized[0] ?? "";
  }

  return JSON.stringify(sanitized);
}

function isImageReference(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(png|jpe?g|webp|gif|avif|svg)$/.test(pathname);
  } catch {
    return /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(url);
  }
}

function areProjectFormValuesEqual(left: ProjectFormValues, right: ProjectFormValues) {
  return (
    left.requestedDate === right.requestedDate &&
    left.requestStatus === right.requestStatus &&
    left.departmentName === right.departmentName &&
    left.projectRequestName === right.projectRequestName &&
    left.contactPerson === right.contactPerson &&
    left.contactNumber === right.contactNumber &&
    left.projectType === right.projectType &&
    left.priorityLevel === right.priorityLevel &&
    left.firstDraftDate === right.firstDraftDate &&
    left.finalDeliverableDate === right.finalDeliverableDate &&
    left.projectObjective === right.projectObjective &&
    left.projectBrief === right.projectBrief &&
    left.creativeAdvice === right.creativeAdvice &&
    left.description === right.description &&
    left.referenceAttachmentUrl === right.referenceAttachmentUrl &&
    left.clientOrganizationId === right.clientOrganizationId
  );
}

function formatProjectFormError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to save project.";

  if (message.includes('violates check constraint "project_activity_action_check"')) {
    return "Project activity logging is not configured yet. Please try again after the activity constraint is updated.";
  }

  if (message.includes("Project client organization must exist")) {
    return "Please select a valid client organization.";
  }

  if (message.includes("You can only create projects for your own organization")) {
    return "You can only create projects for the currently selected organization.";
  }

  if (message.includes("Missing required project fields")) {
    return "Please complete all required project fields before submitting.";
  }

  return message;
}

export function ProjectForm({
  initialValues,
  departments,
  clientOrganizations,
  clients,
  viewer = null,
  clientCreateMode = false,
  submitLabel,
  onSubmit,
  onCancel,
  hideActions = false,
  onValuesChange,
  embedded = false,
  autoCreateTask = true,
  onAutoCreateTaskChange,
  showAutoCreateTaskToggle = false,
}: ProjectFormProps) {
  const organizationFieldRef = useRef<HTMLDivElement | null>(null);
  const requestStatusFieldRef = useRef<HTMLDivElement | null>(null);
  const departmentFieldRef = useRef<HTMLDivElement | null>(null);
  const contactFieldRef = useRef<HTMLDivElement | null>(null);
  const projectTypeFieldRef = useRef<HTMLDivElement | null>(null);
  const priorityLevelFieldRef = useRef<HTMLDivElement | null>(null);
  const [values, setValues] = useState<ProjectFormValues>(initialValues);
  const [openSelect, setOpenSelect] = useState<
    "requestStatus" | "projectType" | "priorityLevel" | "organization" | "contact" | "department" | null
  >(null);
  const [organizationQuery, setOrganizationQuery] = useState("");
  const [customProjectType, setCustomProjectType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [error, setError] = useState("");

  const availableContacts = clients.filter(
    (client) => getUserClientOrganizationIds(client).includes(values.clientOrganizationId),
  );
  const referenceAttachments = useMemo(
    () => parseReferenceAttachments(values.referenceAttachmentUrl),
    [values.referenceAttachmentUrl],
  );
  const selectedOrganization =
    clientOrganizations.find((organization) => organization.id === values.clientOrganizationId) ?? null;
  const filteredOrganizations = useMemo(() => {
    const query = organizationQuery.trim().toLowerCase();
    const ranked = clientOrganizations
      .filter((organization) => {
        if (!query) {
          return true;
        }

        return organization.name.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (!query) {
          return left.name.localeCompare(right.name);
        }

        const leftStarts = left.name.toLowerCase().startsWith(query);
        const rightStarts = right.name.toLowerCase().startsWith(query);
        if (leftStarts !== rightStarts) {
          return leftStarts ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      });

    return ranked;
  }, [clientOrganizations, organizationQuery]);
  const requestedDateValue = values.requestedDate || initialValues.requestedDate || getTodayIsoDate();
  const hasSelectedOrganization = Boolean(values.clientOrganizationId);
  const hasAvailableContacts = availableContacts.length > 0;
  const selectedContact =
    availableContacts.find((client) => client.name === values.contactPerson) ??
    availableContacts.find((client) => client.name === viewer?.name) ??
    availableContacts[0] ??
    null;
  const effectiveRequestStatus = clientCreateMode ? "Waiting List" : values.requestStatus;
  const effectiveDepartmentName = clientCreateMode
    ? values.departmentName.trim() || viewer?.department?.trim() || ""
    : values.departmentName;
  const effectiveContactPerson = clientCreateMode
    ? values.contactPerson.trim() || viewer?.name?.trim() || selectedContact?.name || ""
    : values.contactPerson;
  const effectiveContactNumber = clientCreateMode
    ? values.contactNumber.trim() || viewer?.phone?.trim() || selectedContact?.phone?.trim() || ""
    : values.contactNumber;

  useEffect(() => {
    if (!openSelect) {
      return;
    }

    const refMap = {
      organization: organizationFieldRef,
      requestStatus: requestStatusFieldRef,
      department: departmentFieldRef,
      contact: contactFieldRef,
      projectType: projectTypeFieldRef,
      priorityLevel: priorityLevelFieldRef,
    } as const;

    const activeRef = refMap[openSelect];

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!activeRef.current?.contains(target)) {
        setOpenSelect(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSelect(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSelect]);

  useEffect(() => {
    const isBuiltInProjectType = projectTypeOptions.includes(
      initialValues.projectType as (typeof projectTypeOptions)[number],
    );
    const inferredClientOrganizationId = initialValues.clientOrganizationId || "";
    const nextValues = {
      ...initialValues,
      requestedDate: initialValues.requestedDate || getTodayIsoDate(),
      clientOrganizationId: inferredClientOrganizationId,
      projectType: isBuiltInProjectType ? initialValues.projectType : "Custom",
    };
    const nextCustomProjectType = isBuiltInProjectType ? "" : initialValues.projectType;

    setValues((current) => (areProjectFormValuesEqual(current, nextValues) ? current : nextValues));
    setCustomProjectType((current) => (current === nextCustomProjectType ? current : nextCustomProjectType));
  }, [initialValues]);

  useEffect(() => {
    if (openSelect === "organization") {
      return;
    }

    const nextQuery = selectedOrganization?.name ?? "";
    if (organizationQuery !== nextQuery) {
      setOrganizationQuery(nextQuery);
    }
  }, [openSelect, organizationQuery, selectedOrganization]);

  useEffect(() => {
    onValuesChange?.({
      ...values,
      requestedDate: requestedDateValue,
      requestStatus: effectiveRequestStatus,
      departmentName: effectiveDepartmentName,
      contactPerson: effectiveContactPerson,
      contactNumber: effectiveContactNumber,
      projectType: values.projectType === "Custom" ? customProjectType.trim() : values.projectType,
    });
  }, [
    customProjectType,
    effectiveContactNumber,
    effectiveContactPerson,
    effectiveDepartmentName,
    effectiveRequestStatus,
    onValuesChange,
    requestedDateValue,
    values,
  ]);

  useEffect(() => {
    if (!values.clientOrganizationId) {
      if (values.contactNumber || values.contactPerson) {
        setValues((current) => ({
          ...current,
          contactPerson: "",
          contactNumber: "",
        }));
      }
      return;
    }

    const contactStillValid = availableContacts.some((client) => client.name === values.contactPerson);
    if (contactStillValid) {
      return;
    }

    if (availableContacts.length === 1) {
      const contact = availableContacts[0]!;
      setValues((current) => ({
        ...current,
        contactPerson: contact.name,
        contactNumber: current.contactNumber || contact.phone || "",
      }));
      return;
    }

    if (values.contactNumber || values.contactPerson) {
      setValues((current) => ({
        ...current,
        contactPerson: "",
        contactNumber: "",
      }));
    }
  }, [
    availableContacts,
    values.clientOrganizationId,
    values.contactNumber,
    values.contactPerson,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const today = getTodayIsoDate();
    if (!values.firstDraftDate || !values.finalDeliverableDate) {
      setError("First draft date and final deliverable date are required.");
      return;
    }

    if (values.firstDraftDate && values.firstDraftDate < today) {
      setError("First draft date cannot be before today.");
      return;
    }

    if (
      values.firstDraftDate &&
      values.finalDeliverableDate &&
      values.finalDeliverableDate < values.firstDraftDate
    ) {
      setError("Final deliverable date cannot be before the first draft date.");
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit({
        ...values,
        requestedDate: requestedDateValue,
        requestStatus: effectiveRequestStatus,
        departmentName: effectiveDepartmentName,
        contactPerson: effectiveContactPerson,
        contactNumber: effectiveContactNumber,
        projectType: values.projectType === "Custom" ? customProjectType.trim() : values.projectType,
      });
    } catch (submitError) {
      setError(formatProjectFormError(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReferenceFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const remainingSlots = Math.max(0, 10 - referenceAttachments.length);
    const uploadQueue = files.slice(0, remainingSlots);

    if (uploadQueue.length === 0) {
      setError("You can upload up to 10 reference files.");
      return;
    }

    setUploadingReference(true);
    setError("");

    try {
      const uploadedUrls: string[] = [];

      for (const file of uploadQueue) {
        uploadedUrls.push(await uploadProjectReference(file));
      }

      setValues((current) => {
        const nextUrls = [...parseReferenceAttachments(current.referenceAttachmentUrl), ...uploadedUrls]
          .slice(0, 10);
        return { ...current, referenceAttachmentUrl: serializeReferenceAttachments(nextUrls) };
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Unable to upload reference file.",
      );
    } finally {
      setUploadingReference(false);
    }
  };

  return (
    <>
      {submitting || uploadingReference ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>
              {uploadingReference
                ? "Uploading reference..."
                : submitLabel === "Create Project"
                  ? "Creating project..."
                  : "Saving project..."}
            </p>
          </div>
        </div>
      ) : null}

      <FormSurface onSubmit={handleSubmit} $embedded={embedded}>
       <PreviewRow>
        <PreviewBadge>{getProjectInitial(values.projectRequestName)}</PreviewBadge>
        <PreviewCopy>
          <PreviewTitle>{values.projectRequestName || "Project request name"}</PreviewTitle>
        </PreviewCopy>
      </PreviewRow>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>Deliverable</SectionTitle>
            <SectionDescription>Define what is being requested, how urgent it is, and when it is due.</SectionDescription>
          </SectionHeader>
          <Grid>
            <Field $wide>
              <FloatingField className={values.projectRequestName ? "auth-field is-filled" : "auth-field"}>
                <TextInput
                  value={values.projectRequestName}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, projectRequestName: event.target.value }))
                  }
                  placeholder=" "
                  required
                />
                <span>Project Request Name</span>
              </FloatingField>
            </Field>

            <Field>
              <FloatingSelectField ref={projectTypeFieldRef} $filled $open={openSelect === "projectType"}>
                <SelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={openSelect === "projectType"}
                  onClick={() =>
                    setOpenSelect((current) => (current === "projectType" ? null : "projectType"))
                  }
                >
                  <SelectValue>
                    {values.projectType === "Custom" ? customProjectType || "Custom" : values.projectType || "Select project type"}
                  </SelectValue>
                  <SelectChevron $open={openSelect === "projectType"}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectTrigger>
                <FloatingLabel>Project Type</FloatingLabel>
                {openSelect === "projectType" ? (
                  <SelectMenu role="listbox" aria-label="Project type">
                    {projectTypeOptions.map((option) => (
                      <SelectOption
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={values.projectType === option}
                        $active={values.projectType === option}
                        onClick={() => {
                          setValues((current) => ({ ...current, projectType: option }));
                          if (option !== "Custom") {
                            setCustomProjectType("");
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

            {values.projectType === "Custom" ? (
              <Field>
                <FloatingField className={customProjectType ? "auth-field is-filled" : "auth-field"}>
                  <TextInput
                    value={customProjectType}
                    onChange={(event) => setCustomProjectType(event.target.value)}
                    placeholder=" "
                    required
                  />
                  <span>Custom project type</span>
                </FloatingField>
              </Field>
            ) : null}

            <Field>
              <FloatingSelectField ref={priorityLevelFieldRef} $filled $open={openSelect === "priorityLevel"}>
                <SelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={openSelect === "priorityLevel"}
                  onClick={() =>
                    setOpenSelect((current) => (current === "priorityLevel" ? null : "priorityLevel"))
                  }
                >
                  <SelectValue>{values.priorityLevel || "Select priority"}</SelectValue>
                  <SelectChevron $open={openSelect === "priorityLevel"}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectTrigger>
                <FloatingLabel>Priority Level</FloatingLabel>
                {openSelect === "priorityLevel" ? (
                  <SelectMenu role="listbox" aria-label="Priority level">
                    {priorityLevelOptions.map((option) => (
                      <SelectOption
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={values.priorityLevel === option}
                        $active={values.priorityLevel === option}
                        onClick={() => {
                          setValues((current) => ({ ...current, priorityLevel: option }));
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

            <Field>
              <CustomDatePicker
                label="First Draft Date"
                value={values.firstDraftDate}
                minDate={getTodayIsoDate()}
                onChange={(nextValue) =>
                  setValues((current) => {
                    const nextValues = { ...current, firstDraftDate: nextValue };
                    if (
                      nextValues.finalDeliverableDate &&
                      nextValues.finalDeliverableDate < nextValue
                    ) {
                      nextValues.finalDeliverableDate = nextValue;
                    }
                    return nextValues;
                  })
                }
              />
            </Field>

            <Field>
              <CustomDatePicker
                label="Final Deliverable Date"
                value={values.finalDeliverableDate}
                minDate={values.firstDraftDate || getTodayIsoDate()}
                onChange={(nextValue) =>
                  setValues((current) => ({ ...current, finalDeliverableDate: nextValue }))
                }
              />
            </Field>
          </Grid>
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>{clientCreateMode ? "Organization" : "Request Intake"}</SectionTitle>
            <SectionDescription>
              {clientCreateMode
                ? "The request will be linked to your organization automatically."
                : "Capture the business request before production work starts."}
            </SectionDescription>
          </SectionHeader>
          <Grid>
            <Field $wide>
              <FloatingSelectField ref={organizationFieldRef} $filled={Boolean(organizationQuery)} $open={openSelect === "organization"}>
                <SearchSelectInput
                  value={organizationQuery}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setOrganizationQuery(nextQuery);
                    setValues((current) => ({
                      ...current,
                      clientOrganizationId:
                        selectedOrganization?.name === nextQuery ? current.clientOrganizationId : "",
                    }));
                    setOpenSelect("organization");
                  }}
                  onFocus={() => setOpenSelect("organization")}
                  placeholder=" "
                  aria-haspopup="listbox"
                  aria-expanded={openSelect === "organization"}
                />
                <FloatingLabel>Company Name</FloatingLabel>
                <SelectChevronButton
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() =>
                    setOpenSelect((current) => (current === "organization" ? null : "organization"))
                  }
                >
                  <SelectChevron $open={openSelect === "organization"}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectChevronButton>
                {openSelect === "organization" ? (
                  <SelectMenu role="listbox" aria-label="Company name">
                    {filteredOrganizations.length ? filteredOrganizations.map((organization) => (
                      <SelectOption
                        key={organization.id}
                        type="button"
                        role="option"
                        aria-selected={values.clientOrganizationId === organization.id}
                        $active={values.clientOrganizationId === organization.id}
                        onClick={() => {
                          setOrganizationQuery(organization.name);
                          setValues((current) => ({
                            ...current,
                            clientOrganizationId: organization.id,
                            contactPerson: "",
                            contactNumber: "",
                          }));
                          setOpenSelect(null);
                        }}
                      >
                        {organization.name}
                      </SelectOption>
                    )) : (
                      <EmptySelectState>No matching companies</EmptySelectState>
                    )}
                  </SelectMenu>
                ) : null}
              </FloatingSelectField>
            </Field>

            {clientCreateMode ? null : (
              <>
                <Field>
                  <FloatingSelectField ref={requestStatusFieldRef} $filled $open={openSelect === "requestStatus"}>
                    <SelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={openSelect === "requestStatus"}
                      onClick={() =>
                        setOpenSelect((current) => (current === "requestStatus" ? null : "requestStatus"))
                      }
                    >
                      <SelectValue>{values.requestStatus || "Select status"}</SelectValue>
                      <SelectChevron $open={openSelect === "requestStatus"}>
                        <IconChevronDown />
                      </SelectChevron>
                    </SelectTrigger>
                    <FloatingLabel>Status</FloatingLabel>
                    {openSelect === "requestStatus" ? (
                      <SelectMenu role="listbox" aria-label="Request status">
                        {requestStatusOptions.map((option) => (
                          <SelectOption
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={values.requestStatus === option}
                            $active={values.requestStatus === option}
                            onClick={() => {
                              setValues((current) => ({ ...current, requestStatus: option }));
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

                <Field>
                  <FloatingSelectField ref={departmentFieldRef} $filled={Boolean(values.departmentName)} $open={openSelect === "department"}>
                    <SelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={openSelect === "department"}
                      onClick={() =>
                        setOpenSelect((current) => (current === "department" ? null : "department"))
                      }
                    >
                      <SelectValue>{values.departmentName || "Select department"}</SelectValue>
                      <SelectChevron $open={openSelect === "department"}>
                        <IconChevronDown />
                      </SelectChevron>
                    </SelectTrigger>
                    <FloatingLabel>Department Name</FloatingLabel>
                    {openSelect === "department" ? (
                      <SelectMenu role="listbox" aria-label="Department name">
                        {departments.map((department) => (
                          <SelectOption
                            key={department.id}
                            type="button"
                            role="option"
                            aria-selected={values.departmentName === department.name}
                            $active={values.departmentName === department.name}
                            onClick={() => {
                              setValues((current) => ({ ...current, departmentName: department.name }));
                              setOpenSelect(null);
                            }}
                          >
                            {department.name}
                          </SelectOption>
                        ))}
                      </SelectMenu>
                    ) : null}
                  </FloatingSelectField>
                </Field>
              </>
            )}
          </Grid>
        </SectionCard>

        {clientCreateMode ? null : (
          <SectionCard>
            <SectionHeader>
              <SectionTitle>Contact</SectionTitle>
              <SectionDescription>
                {hasSelectedOrganization
                  ? hasAvailableContacts
                    ? "Choose the liaison for this organization. If none is selected, it can be added later."
                    : "No liaison person has been added for this organization yet. Skip this for now and add one later."
                  : "Select an organization first. Liaison information can be added after that."}
              </SectionDescription>
            </SectionHeader>
            <Grid>
              {hasSelectedOrganization && hasAvailableContacts ? (
                <Field $wide>
                  <FloatingSelectField ref={contactFieldRef} $filled={Boolean(values.contactPerson)} $open={openSelect === "contact"}>
                    <SelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={openSelect === "contact"}
                      onClick={() => {
                        setOpenSelect((current) => (current === "contact" ? null : "contact"));
                      }}
                    >
                      <SelectValue>
                        {values.contactPerson || "No primary contact"}
                      </SelectValue>
                      <SelectChevron $open={openSelect === "contact"}>
                        <IconChevronDown />
                      </SelectChevron>
                    </SelectTrigger>
                    <FloatingLabel>Primary Contact</FloatingLabel>
                    {openSelect === "contact" ? (
                      <SelectMenu role="listbox" aria-label="Primary contact">
                        <SelectOption
                          type="button"
                          role="option"
                          aria-selected={!values.contactPerson}
                          $active={!values.contactPerson}
                          onClick={() => {
                            setValues((current) => ({ ...current, contactPerson: "", contactNumber: "" }));
                            setOpenSelect(null);
                          }}
                        >
                          No primary contact
                        </SelectOption>
                        {availableContacts.map((client) => (
                          <SelectOption
                            key={client.id}
                            type="button"
                            role="option"
                            aria-selected={values.contactPerson === client.name}
                            $active={values.contactPerson === client.name}
                            onClick={() => {
                              setValues((current) => ({
                                ...current,
                                contactPerson: client.name,
                                contactNumber: client.phone ?? current.contactNumber ?? "",
                              }));
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
              ) : !hasSelectedOrganization ? (
                <ContactPlaceholder>Select organization first.</ContactPlaceholder>
              ) : null}
              {values.contactPerson ? (
                <Field $wide>
                  <FloatingField className={values.contactNumber ? "auth-field is-filled" : "auth-field"}>
                    <TextInput
                      value={values.contactNumber}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, contactNumber: event.target.value }))
                      }
                      placeholder=" "
                    />
                    <span>Contact Number</span>
                  </FloatingField>
                </Field>
              ) : null}
            </Grid>
          </SectionCard>
        )}

        <SectionCard>
          <SectionHeader>
            <SectionTitle>Brief</SectionTitle>
            <SectionDescription>Give the design team the business goal, context, and extra direction.</SectionDescription>
          </SectionHeader>
          <Grid>
            <Field $wide>
              <FloatingTextAreaField $filled={Boolean(values.projectObjective)}>
                <TextArea
                  value={values.projectObjective}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, projectObjective: event.target.value }))
                  }
                  rows={3}
                  placeholder=" "
                />
                <FloatingLabel>Project Objective</FloatingLabel>
              </FloatingTextAreaField>
            </Field>

            <Field $wide>
              <FloatingTextAreaField $filled={Boolean(values.projectBrief)}>
                <TextArea
                  value={values.projectBrief}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      projectBrief: limitWords(event.target.value, DESCRIPTION_WORD_LIMIT),
                    }))
                  }
                  rows={4}
                  placeholder=" "
                />
                <FloatingLabel>Project Brief</FloatingLabel>
              </FloatingTextAreaField>
              <FieldMeta>
                {countWords(values.projectBrief)} / {DESCRIPTION_WORD_LIMIT} words
              </FieldMeta>
            </Field>

            <Field $wide>
              <FloatingTextAreaField $filled={Boolean(values.creativeAdvice)}>
                <TextArea
                  value={values.creativeAdvice}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, creativeAdvice: event.target.value }))
                  }
                  rows={3}
                  placeholder=" "
                />
                <FloatingLabel>Creative Advice</FloatingLabel>
              </FloatingTextAreaField>
            </Field>

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
                />
                <FloatingLabel>Description</FloatingLabel>
              </FloatingTextAreaField>
              <FieldMeta>
                {countWords(values.description)} / {DESCRIPTION_WORD_LIMIT} words
              </FieldMeta>
            </Field>
          </Grid>
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>Reference</SectionTitle>
            <SectionDescription>
              Upload up to 10 reference files. Tap any file tile to open it. PDF, Office docs, zip, text, or image files up to 12MB each. {referenceAttachments.length}/10 uploaded.
            </SectionDescription>
          </SectionHeader>
          <ReferenceGrid>
            {referenceAttachments.map((url, index) => (
              <ReferenceTile
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                {isImageReference(url) ? (
                  <ReferenceThumbnailWrap>
                    <ReferenceThumbnail
                      src={url}
                      alt={getReferenceLabel(url) || `Reference image ${index + 1}`}
                    />
                  </ReferenceThumbnailWrap>
                ) : (
                  <ReferenceTileIcon>
                    <IconUpload />
                  </ReferenceTileIcon>
                )}
                <ReferenceTileName>{getReferenceLabel(url) || `File ${index + 1}`}</ReferenceTileName>
                <ReferenceRemoveButton
                  type="button"
                  aria-label={`Remove reference file ${index + 1}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextUrls = referenceAttachments.filter((_, itemIndex) => itemIndex !== index);
                    setValues((current) => ({
                      ...current,
                      referenceAttachmentUrl: serializeReferenceAttachments(nextUrls),
                    }));
                  }}
                >
                  <IconClose />
                </ReferenceRemoveButton>
              </ReferenceTile>
            ))}

            {referenceAttachments.length < 10 ? (
              <ReferenceAddTile as="label">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleReferenceFileChange}
                  disabled={uploadingReference}
                />
                <ReferenceAddIcon>+</ReferenceAddIcon>
                <ReferenceAddLabel>Upload file</ReferenceAddLabel>
              </ReferenceAddTile>
            ) : null}
          </ReferenceGrid>

          {referenceAttachments.length === 0 ? (
            <ReferenceEmptyState>No file attached yet.</ReferenceEmptyState>
          ) : null}
        </SectionCard>

        {showAutoCreateTaskToggle ? (
          <SectionCard>
            <SectionHeader>
              <SectionTitle>Task Setup</SectionTitle>
              <SectionDescription>
                Automatically add an open task for all designers when this project is created.
              </SectionDescription>
            </SectionHeader>
            <ToggleCardButton
              type="button"
              onClick={() => onAutoCreateTaskChange?.(!autoCreateTask)}
              aria-pressed={autoCreateTask}
            >
              <ToggleCopy>
                <strong>Auto create task</strong>
                <span>
                  The task will use the project name with a task suffix and remain open for all designers until a manager assigns it.
                </span>
              </ToggleCopy>
              <ToggleTrack $active={autoCreateTask}>
                <ToggleThumb $active={autoCreateTask} />
              </ToggleTrack>
            </ToggleCardButton>
          </SectionCard>
        ) : null}

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

const FormSurface = styled.form<{ $embedded?: boolean }>`
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
    width: ${({ $embedded }) => ($embedded ? "100%" : "800px")};
    margin: auto;
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

const SearchSelectInput = styled.input`
  ${controlCss}
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 48px;
  padding: 16px 40px 9px 12px;
  font-size: 16px;

  ${tabletUp} {
    min-height: 52px;
    padding: 18px 44px 10px 14px;
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

const SectionCard = styled.section`
  ${surfaceCss}
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;

  ${tabletUp} {
    gap: 12px;
    padding: 14px;
    border-radius: 20px;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  color: #2e2a27;
  font-size: 0.94rem;
  line-height: 1.2;
  font-weight: 800;
`;

const SectionDescription = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
`;

const ToggleCardButton = styled.button`
  ${controlCss}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 64px;
  padding: 14px;
  text-align: left;
  cursor: pointer;
`;

const ToggleCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  strong {
    color: #2e2a27;
    font-size: 0.92rem;
    line-height: 1.2;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    line-height: 1.4;
  }
`;

const ToggleTrack = styled.span<{ $active: boolean }>`
  width: 46px;
  height: 28px;
  border-radius: 999px;
  flex: 0 0 auto;
  position: relative;
  background: ${({ $active }) => ($active ? "#1f4339" : "rgba(223, 214, 201, 0.95)")};
  transition: background 0.18s ease;
`;

const ToggleThumb = styled.span<{ $active: boolean }>`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 8px 18px rgba(49, 35, 18, 0.16);
  transform: translateX(${({ $active }) => ($active ? "18px" : "0")});
  transition: transform 0.18s ease;
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

const SelectChevronButton = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  padding: 0;
  z-index: 4;

  ${tabletUp} {
    right: 12px;
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

const EmptySelectState = styled.div`
  min-height: 44px;
  padding: 10px 14px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.4;
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

const ContactPlaceholder = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
`;

const ReferenceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  ${tabletUp} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  ${desktop} {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
`;

const ReferenceEmptyState = styled.span`
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.4;
`;

const ReferenceTileBase = css`
  position: relative;
  aspect-ratio: 1;
  min-height: 94px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
`;

const ReferenceTile = styled.a`
  ${ReferenceTileBase}
  color: inherit;
  text-decoration: none;

  &:hover {
    background: rgba(251, 250, 247, 0.96);
  }
`;

const ReferenceTileIcon = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(31, 67, 57, 0.1);
  color: #1f4339;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ReferenceThumbnailWrap = styled.div`
  width: 100%;
  min-width: 0;
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(244, 240, 235, 0.9);
`;

const ReferenceThumbnail = styled.img`
  width: 100%;
  height: 100%;
  min-height: 52px;
  object-fit: cover;
  display: block;
`;

const ReferenceTileName = styled.span`
  width: 100%;
  color: #2e2a27;
  font-size: 0.74rem;
  line-height: 1.3;
  font-weight: 700;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ReferenceRemoveButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #8f4d31;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ReferenceAddTile = styled.label`
  ${ReferenceTileBase}
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;

  input {
    display: none;
  }
`;

const ReferenceAddIcon = styled.span`
  color: #1f4339;
  font-size: 1.6rem;
  line-height: 1;
  font-weight: 500;
`;

const ReferenceAddLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.2;
  font-weight: 700;
`;

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V5" />
      <path d="m7 10 5-5 5 5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
