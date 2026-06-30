"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectForm, ProjectFormValues } from "@/components/project-form";
import { useAppState } from "@/components/app-state";
import { ClientTitleLogo } from "@/components/client-title-logo";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { parseTabularDocument } from "@/lib/spreadsheet";
import { canCreateProject, canCreateProjectForOrganization, getUserClientOrganizationIds } from "@/lib/permissions";
import { formatRole } from "@/lib/display";

const desktop = "@media (min-width: 768px)";
const today = new Date();
const initialRequestedDate = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;

const initialValues: ProjectFormValues = {
  requestedDate: initialRequestedDate,
  requestStatus: "",
  departmentName: "",
  projectRequestName: "",
  contactPerson: "",
  contactNumber: "",
  projectType: "",
  priorityLevel: "",
  firstDraftDate: "",
  finalDeliverableDate: "",
  projectObjective: "",
  projectBrief: "",
  creativeAdvice: "",
  description: "",
  referenceAttachmentUrl: "",
  clientOrganizationId: "",
};

export function ProjectCreateScreen() {
  const { state, user, createProject, bulkCreateProjects } = useAppState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [routingMessage, setRoutingMessage] = useState("");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [autoCreateTask, setAutoCreateTask] = useState(true);
  const [bulkAutoCreateTask, setBulkAutoCreateTask] = useState(true);
  const [showBulkDropOverlay, setShowBulkDropOverlay] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState<Array<{
    projectId: string;
    requestedDate: string;
    projectRequestName: string;
    requestStatus: string;
    departmentName: string;
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
    clientOrganizationName: string;
    primaryContactEmail?: string;
  }>>([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkSummary, setBulkSummary] = useState("");
  const dragDepthRef = useRef(0);
  const safeUser = user;
  const { activeClientOrganization, activeClientOrganizationId, clientOrganizationIds, scopedHref } =
    useActiveClientOrganization(safeUser, state.clientOrganizations);
  const canManage = safeUser ? canCreateProject(safeUser.role) : false;
  const departments = state.departments;
  const allowedClientOrganizationIds = useMemo(
    () =>
      safeUser?.role === "client"
        ? activeClientOrganizationId
          ? [activeClientOrganizationId]
          : clientOrganizationIds
        : safeUser
          ? getUserClientOrganizationIds(safeUser)
          : [],
    [activeClientOrganizationId, clientOrganizationIds, safeUser],
  );
  const clientOrganizations = useMemo(
    () =>
      safeUser?.role === "client"
        ? state.clientOrganizations.filter((organization) => allowedClientOrganizationIds.includes(organization.id))
        : state.clientOrganizations,
    [allowedClientOrganizationIds, safeUser?.role, state.clientOrganizations],
  );
  const clients = state.users.filter((candidate) => candidate.role === "client");
  const currentClientOrganization = activeClientOrganization;
  const preselectedClientOrganizationId = searchParams.get("clientOrganizationId") ?? "";
  const resolvedClientOrganizationId = clientOrganizations.some(
    (organization) => organization.id === preselectedClientOrganizationId,
  )
    ? preselectedClientOrganizationId
    : activeClientOrganizationId ?? "";
  const formInitialValues = useMemo<ProjectFormValues>(
    () => ({
      ...initialValues,
      requestStatus: safeUser?.role === "client" ? "Waiting List" : initialValues.requestStatus,
      departmentName: safeUser?.role === "client" ? safeUser.department ?? "" : initialValues.departmentName,
      contactPerson: safeUser?.role === "client" ? safeUser.name : initialValues.contactPerson,
      contactNumber: safeUser?.role === "client" ? safeUser.phone ?? "" : initialValues.contactNumber,
      clientOrganizationId: resolvedClientOrganizationId,
    }),
    [resolvedClientOrganizationId, safeUser?.department, safeUser?.name, safeUser?.phone, safeUser?.role],
  );
  const canCreateAnyProject = Boolean(
    safeUser &&
      (canManage ||
        clientOrganizations.some((organization) => canCreateProjectForOrganization(safeUser, organization.id))),
  );

  const handleSubmit = async (values: ProjectFormValues) => {
    const project = await createProject({
      requestedDate: values.requestedDate,
      requestStatus: values.requestStatus,
      departmentName: values.departmentName,
      projectRequestName: values.projectRequestName,
      contactPerson: values.contactPerson,
      contactNumber: values.contactNumber,
      projectType: values.projectType,
      priorityLevel: values.priorityLevel,
      firstDraftDate: values.firstDraftDate,
      finalDeliverableDate: values.finalDeliverableDate,
      projectObjective: values.projectObjective,
      projectBrief: values.projectBrief,
      creativeAdvice: values.creativeAdvice,
      description: values.description,
      referenceAttachmentUrl: values.referenceAttachmentUrl,
      clientOrganizationId: values.clientOrganizationId,
      autoCreateTask,
    });

    setRoutingMessage("Opening project...");
    router.push(scopedHref(`/projects/${project.id}`));
  };

  const processBulkFile = async (file: File) => {
    setBulkError("");
    setBulkSummary("");

    try {
      const parsed = await parseTabularDocument(file);
      if (!parsed.rows.length) {
        throw new Error("The spreadsheet is empty.");
      }

      const normalizedRows = parsed.rows.map((row) => ({
        projectId:
          row.project_id ||
          row.project_code ||
          "",
        requestedDate:
          row.requested_date ||
          "",
        projectRequestName:
          row.project_request_name ||
          row.project_name ||
          row.name ||
          "",
        requestStatus:
          row.status ||
          row.request_status ||
          "Waiting List",
        departmentName:
          row.department_name ||
          row.department ||
          "",
        contactPerson:
          row.contact_person ||
          "",
        contactNumber:
          row.contact_number ||
          row.phone ||
          "",
        projectType:
          row.project_type ||
          row.category ||
          "",
        priorityLevel:
          row.priority_level ||
          row.priority ||
          "Medium",
        firstDraftDate:
          row.first_draft_date ||
          "",
        finalDeliverableDate:
          row.final_deliverable_date ||
          row.due_date ||
          "",
        projectObjective:
          row.project_objective ||
          "",
        projectBrief:
          row.project_brief ||
          row.description ||
          "",
        creativeAdvice:
          row.creative_advice ||
          "",
        description:
          row.description ||
          "",
        referenceAttachmentUrl:
          row.reference_attachment_url ||
          row.reference_url ||
          row.reference ||
          "",
        clientOrganizationName:
          row.company_name ||
          row.client_organization ||
          row.client_organization_name ||
          row.organization ||
          "",
        primaryContactEmail:
          row.primary_contact_email ||
          row.contact_email ||
          "",
      }));

      setBulkRows(normalizedRows);
      setBulkFileName(file.name);
      setBulkSummary(`${normalizedRows.length} row${normalizedRows.length === 1 ? "" : "s"} ready to import.`);
    } catch (nextError) {
      setBulkRows([]);
      setBulkFileName("");
      setBulkSummary("");
      setBulkError(nextError instanceof Error ? nextError.message : "Unable to read the spreadsheet.");
    }
  };

  const handleBulkFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    await processBulkFile(file);
  };

  useEffect(() => {
    if (!showBulkModal) {
      dragDepthRef.current = 0;
      setShowBulkDropOverlay(false);
      return;
    }

    const hasFiles = (event: globalThis.DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setShowBulkDropOverlay(true);
    };

    const handleDragOver = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setShowBulkDropOverlay(true);
    };

    const handleDragLeave = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setShowBulkDropOverlay(false);
      }
    };

    const handleDrop = async (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setShowBulkDropOverlay(false);

      const file = event.dataTransfer?.files?.[0] ?? null;
      if (!file) {
        return;
      }

      await processBulkFile(file);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [showBulkModal]);

  const handleBulkOverlayDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setShowBulkDropOverlay(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (!file) {
      return;
    }

    await processBulkFile(file);
  };

  const handleBulkImport = async () => {
    if (!bulkRows.length) {
      setBulkError("Upload a spreadsheet first.");
      return;
    }

    setRoutingMessage("Importing projects...");
    setBulkError("");
    setBulkSummary("");

    try {
      const result = await bulkCreateProjects({
        rows: bulkRows,
        autoCreateTask: bulkAutoCreateTask,
      });
      setBulkSummary(`${result.createdCount} projects created successfully.`);
      setBulkRows([]);
      setBulkFileName("");
      setShowBulkModal(false);
      router.push(scopedHref("/projects"));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Bulk import failed.";
      setBulkError(message);
    } finally {
      setRoutingMessage("");
    }
  };

  if (!safeUser) {
    return null;
  }

  return (
    <Shell>
      {routingMessage ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>{routingMessage}</p>
          </div>
        </div>
      ) : null}

      {showBulkModal && showBulkDropOverlay ? (
        <BulkDropOverlay
          role="status"
          aria-live="polite"
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={handleBulkOverlayDrop}
        >
          <BulkDropCard>
            <strong>Drop this file</strong>
            <span>Release to load it into bulk upload.</span>
          </BulkDropCard>
        </BulkDropOverlay>
      ) : null}

      <SidebarRail>
        <AppSidebar user={safeUser} activeLabel="Projects" pinToViewport />
      </SidebarRail>

      <Content>
        <Header>
          <HeaderCopy>
            <Eyebrow>{formatRole(safeUser.role).toUpperCase()}</Eyebrow>
            <TitleRow>
              {safeUser.role === "client" ? <HeaderClientLogo organization={currentClientOrganization} /> : null}
              <Title>Create project</Title>
            </TitleRow>
            <Subtitle>
              Create the project workspace first, then link client, company, and team when you are
              ready.
            </Subtitle>
          </HeaderCopy>

          {canManage ? (
            <HeaderActions>
              <BulkTriggerButton type="button" onClick={() => setShowBulkModal(true)}>
                Bulk upload
              </BulkTriggerButton>
            </HeaderActions>
          ) : null}
        </Header>

        {canCreateAnyProject ? (
          <ProjectForm
            initialValues={formInitialValues}
            departments={departments}
            clientOrganizations={clientOrganizations}
            clients={clients}
            viewer={safeUser}
            clientCreateMode={safeUser.role === "client"}
            submitLabel="Create Project"
            onSubmit={handleSubmit}
            autoCreateTask={autoCreateTask}
            onAutoCreateTaskChange={setAutoCreateTask}
            showAutoCreateTaskToggle
            onCancel={() => router.push(scopedHref("/projects"))}
          />
        ) : (
          <EmptyCard>
            <strong>Access restricted</strong>
            <p>You can only create projects for organizations you belong to.</p>
          </EmptyCard>
        )}

        {canManage && showBulkModal ? (
          <ModalBackdrop onClick={() => setShowBulkModal(false)}>
            <ModalCard onClick={(event) => event.stopPropagation()}>
              <ModalHeader>
                <div>
                  <BulkTitle>Bulk upload spreadsheet</BulkTitle>
                  <ModalDescription>
                    Import many projects at once using CSV or Excel. Missing client organizations
                    will be created automatically as external organizations.
                  </ModalDescription>
                  <ModalLinkRow>
                    <TemplateLink href="/project-import-template.csv" download>
                      Download template
                    </TemplateLink>
                  </ModalLinkRow>
                </div>
                <ModalClose type="button" onClick={() => setShowBulkModal(false)} aria-label="Close">
                  <IconClose />
                </ModalClose>
              </ModalHeader>

              <BulkUploadGrid>
                <BulkUploadTile as="label">
                  <BulkUploadInner>
                    <IconUpload />
                    <span>{bulkFileName || "Upload CSV or XLSX file"}</span>
                  </BulkUploadInner>
                  <HiddenFileInput
                    type="file"
                    accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleBulkFileChange}
                  />
                </BulkUploadTile>

                <BulkImportMeta>
                  <strong>{bulkSummary || "No file selected yet."}</strong>
                  <p>
                    Columns: Project ID, Requested Date, Status, Company Name, Department Name,
                    Project Request Name, Contact Person, Contact Number, Project Type, Priority
                    Level, First Draft Date, Final Deliverable Date, Project Objective, Project
                    Brief, Creative Advice, Description, Reference.
                  </p>
                </BulkImportMeta>
              </BulkUploadGrid>

              <BulkToggleCardButton
                type="button"
                onClick={() => setBulkAutoCreateTask((current) => !current)}
                aria-pressed={bulkAutoCreateTask}
              >
                <BulkToggleCopy>
                  <strong>Auto create task</strong>
                  <span>
                    Add the same open task used in the create-project flow for imported WIP and
                    Pending Review projects.
                  </span>
                </BulkToggleCopy>
                <BulkToggleTrack $active={bulkAutoCreateTask}>
                  <BulkToggleThumb $active={bulkAutoCreateTask} />
                </BulkToggleTrack>
              </BulkToggleCardButton>

              {bulkError ? <BulkError>{bulkError}</BulkError> : null}

              <BulkActions>
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleBulkImport}
                  disabled={!bulkRows.length || Boolean(routingMessage)}
                >
                  Import file
                </button>
              </BulkActions>
            </ModalCard>
          </ModalBackdrop>
        ) : null}
      </Content>
    </Shell>
  );
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const Shell = styled.main`
  display: block;
  min-height: 100vh;
  padding: 16px 14px 20px;

  ${desktop} {
    display: flex;
    align-items: flex-start;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
  }
`;

const SidebarRail = styled.div`
  ${desktop} {
    width: 260px;
    min-width: 260px;
    flex: 0 0 260px;
  }
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 20px 24px 24px;
    border-radius: 0 26px 26px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84));
  }
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 16px;

  ${desktop} {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
`;

const HeaderCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
`;

const Eyebrow = styled.p`
  margin: 0;
  color: var(--color-text-light);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const HeaderClientLogo = styled(ClientTitleLogo)`
  width: 46px;
  height: 46px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
  flex: 0 0 auto;
`;

const Subtitle = styled.p`
  margin: 0;
  max-width: 760px;
  color: var(--color-text-muted);
  font-size: 0.96rem;
  line-height: 1.55;
`;

const EmptyCard = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 22px;
  border-radius: 24px;

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    line-height: 1.5;
  }
`;

const BulkTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
`;

const TemplateLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
`;

const BulkTriggerButton = styled.button`
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 700;
`;

const BulkUploadGrid = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: 260px minmax(0, 1fr);
    align-items: stretch;
  }
`;

const BulkUploadTile = styled.label`
  ${cardSurface}
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  cursor: pointer;
`;

const BulkUploadInner = styled.div`
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  padding: 18px;
  color: var(--color-text);

  svg {
    width: 22px;
    height: 22px;
    color: #8d6520;
  }

  span {
    font-size: 0.88rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const BulkImportMeta = styled.div`
  ${cardSurface}
  display: grid;
  gap: 8px;
  padding: 18px;
  border-radius: 20px;

  strong {
    font-size: 0.92rem;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
`;

const BulkToggleCardButton = styled.button`
  ${cardSurface}
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-radius: 20px;
  text-align: left;
  cursor: pointer;
`;

const BulkToggleCopy = styled.div`
  display: grid;
  gap: 4px;

  strong {
    font-size: 0.92rem;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
`;

const BulkToggleTrack = styled.span<{ $active: boolean }>`
  position: relative;
  display: inline-flex;
  width: 52px;
  height: 30px;
  padding: 3px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "rgba(36, 112, 117, 0.9)" : "rgba(214, 205, 192, 0.95)")};
  flex: 0 0 auto;
  transition: background 0.2s ease;
`;

const BulkToggleThumb = styled.span<{ $active: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #fffdf9;
  box-shadow: 0 8px 18px rgba(66, 45, 21, 0.18);
  transform: translateX(${({ $active }) => ($active ? "22px" : "0")});
  transition: transform 0.2s ease;
`;

const BulkError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.88rem;
  line-height: 1.45;
`;

const BulkActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);
`;

const BulkDropOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(28, 29, 28, 0.24);
  backdrop-filter: blur(14px);
`;

const BulkDropCard = styled.div`
  ${cardSurface}
  min-width: min(100%, 320px);
  display: grid;
  gap: 8px;
  padding: 24px 28px;
  border-radius: 26px;
  text-align: center;

  strong {
    font-size: 1.05rem;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    line-height: 1.5;
  }
`;

const ModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 720px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-radius: 26px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const ModalDescription = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.5;
`;

const ModalLinkRow = styled.div`
  display: flex;
  margin-top: 12px;
`;

const ModalClose = styled.button`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  flex: 0 0 40px;

  svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
  }
`;

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}
