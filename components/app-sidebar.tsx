"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMemo } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppNavLabel, getPrimaryNavItems } from "@/lib/navigation";
import { getAttentionTaskCount } from "@/lib/task-attention";
import { User } from "@/lib/types";

const tablet = "@media (min-width: 768px) and (max-width: 1099px)";
const tabletUp = "@media (min-width: 768px)";
const desktop = "@media (min-width: 1100px)";

type SidebarLabel = AppNavLabel;

export function AppSidebar({
  user,
  activeLabel,
}: {
  user: User;
  activeLabel: SidebarLabel;
}) {
  const { state } = useAppState();
  const taskBadgeCount = useMemo(() => {
    return getAttentionTaskCount(user, state.projects);
  }, [state.projects, user]);
  const badgeLabel: SidebarLabel = user.role === "client" ? "Projects" : "Tasks";
  const navItems: Array<{
    label: SidebarLabel;
    href: string;
    icon: ReactNode;
  }> = getPrimaryNavItems(user.role).map((item) => ({
    ...item,
    icon:
      item.label === "Home" ? (
        <IconHome />
      ) : item.label === "Projects" ? (
        <IconFolder />
      ) : item.label === "Tasks" ? (
        <IconCheckCircle />
      ) : item.label === "Team" ? (
        <IconUsers />
      ) : item.label === "Liaisons" ? (
        <IconUsers />
      ) : (
        <IconUser />
      ),
  }));

  return (
    <Sidebar>
      <div>
        <Brand src="/haus_logo.png" alt="Haus" />
        <SidebarNav aria-label="Primary sections">
          {navItems.map((item) => (
            <SidebarLink key={item.label} href={item.href} $active={item.label === activeLabel}>
              <SidebarIcon>{item.icon}</SidebarIcon>
              <SidebarLabelRow>
                <span>{item.label}</span>
                {item.label === badgeLabel && taskBadgeCount > 0 ? (
                  <TaskBadge>{taskBadgeCount > 99 ? "99+" : taskBadgeCount}</TaskBadge>
                ) : null}
              </SidebarLabelRow>
            </SidebarLink>
          ))}
        </SidebarNav>
      </div>
    </Sidebar>
  );
}

const Sidebar = styled.aside`
  display: none;

  ${desktop} {
    position: sticky;
    top: 8px;
    width: 260px;
    flex: 0 0 260px;
    align-self: flex-start;
    height: calc(100vh - 16px);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 22px 16px;
    overflow-y: auto;
    border-right: 1px solid rgba(230, 224, 215, 0.95);
    border-radius: 26px 0 0 26px;
    background: rgba(255, 255, 255, 0.62);
  }
`;

const Brand = styled.img`
  padding: 10px 8px 24px;
  width: 124px;
  height: auto;
  display: block;
`;

const SidebarNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 28px;
`;

const sidebarItemCss = css<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  color: ${({ $active }) => ($active ? "var(--color-text)" : "var(--color-text-muted)")};
  background: ${({ $active }) => ($active ? "#f5efe5" : "transparent")};
  box-shadow: ${({ $active }) =>
    $active ? "inset 0 0 0 1px rgba(230, 224, 215, 0.9)" : "none"};
  text-align: left;
  text-decoration: none;
  font-size: 0.96rem;
  transition:
    background-color 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;

  &:hover {
    color: var(--color-text);
    background: ${({ $active }) => ($active ? "#f5efe5" : "rgba(245, 239, 229, 0.78)")};
    box-shadow: ${({ $active }) =>
      $active
        ? "inset 0 0 0 1px rgba(230, 224, 215, 0.9)"
        : "inset 0 0 0 1px rgba(230, 224, 215, 0.72), 0 8px 18px rgba(31, 31, 31, 0.05)"};
    transform: translateX(2px);
  }
`;

const SidebarLink = styled(Link)<{ $active?: boolean }>`
  ${sidebarItemCss}
`;

const SidebarIcon = styled.span`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.72;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SidebarLabelRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const TaskBadge = styled.span`
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #d94b4b;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
`;

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5h6l2-2H20a1 1 0 0 1 1 1v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.8 12 2.1 2.2 4.6-4.8" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M4.5 18a5.5 5.5 0 0 1 9 0" />
      <path d="M14.5 18a4.5 4.5 0 0 1 5-3.7" />
    </svg>
  );
}


function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="14" rx="2.5" />
      <path d="M8 4v4M16 4v4M4 10h16" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5a1.5 1.5 0 0 1 1-1.5Z" />
      <path d="M14 3.5V8h4" />
    </svg>
  );
}
