import { DemoState } from "@/lib/types";

export const initialAppState: DemoState = {
  departments: [
    { id: "dept-admin", name: "Admin" },
    { id: "dept-audit", name: "Audit" },
    { id: "dept-commercial", name: "Commercial" },
    { id: "dept-executive-office", name: "Executive Office" },
    { id: "dept-finance", name: "Finance" },
    { id: "dept-human-resource", name: "Human Resource" },
    { id: "dept-it", name: "IT" },
    { id: "dept-legal", name: "Legal" },
    { id: "dept-marketing", name: "Marketing" },
    { id: "dept-procurement", name: "Procurement" },
    { id: "dept-rnd-technical", name: "R&D and Technical" },
    { id: "dept-sales", name: "Sales" },
    { id: "dept-warehouse", name: "Warehouse" },
  ],
  clientOrganizations: [],
  users: [],
  projects: [],
  invitations: [],
};
