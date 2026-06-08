"use client";

import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectForm, ProjectFormValues } from "@/components/project-form";
import { useAppState } from "@/components/app-state";
import { canCreateProject } from "@/lib/permissions";
import { formatRole } from "@/lib/display";

const desktop = "@media (min-width: 768px)";

const initialValues: ProjectFormValues = {
  name: "",
  imageUrl: "",
  description: "",
  category: "Brand Identity",
  dueDate: "2026-06-30",
  clientId: "",
  staffIds: [],
};

export function ProjectCreateScreen() {
  const { state, user, createProject } = useAppState();
  const router = useRouter();

  if (!user) {
    return null;
  }

  const canManage = canCreateProject(user.role);
  const clients = state.users.filter((candidate) => candidate.role === "client");
  const staff = state.users.filter((candidate) => candidate.role !== "client");

  const handleSubmit = async (values: ProjectFormValues) => {
    const project = createProject({
      name: values.name,
      imageUrl: values.imageUrl,
      description: values.description,
      category: values.category,
      dueDate: values.dueDate,
      clientId: values.clientId,
      staffIds: values.staffIds,
    });

    router.push(`/projects/${project.id}`);
  };

  return (
    <Shell>
      <AppSidebar user={user} activeLabel="Projects" />

      <Content>
        <Header>
          <Eyebrow>{formatRole(user.role).toUpperCase()}</Eyebrow>
          <Title>Create project</Title>
          <Subtitle>
            Create a new project workspace, assign the client, choose staff, and set the first
            delivery timeline.
          </Subtitle>
        </Header>

        {canManage ? (
          clients.length && staff.length ? (
            <ProjectForm
              initialValues={initialValues}
              clients={clients}
              staff={staff}
              submitLabel="Create Project"
              onSubmit={handleSubmit}
              onCancel={() => router.push("/projects")}
            />
          ) : (
            <EmptyCard>
              <strong>Project setup needs users first</strong>
              <p>Add at least one client and one internal team member before creating a project.</p>
            </EmptyCard>
          )
        ) : (
          <EmptyCard>
            <strong>Access restricted</strong>
            <p>Only managers can create projects.</p>
          </EmptyCard>
        )}
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
    align-items: stretch;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
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
  gap: 8px;
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
