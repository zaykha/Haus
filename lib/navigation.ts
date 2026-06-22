import { Role } from "@/lib/types";

export type AppNavLabel = "Home" | "Projects" | "Tasks" | "Clients" | "Liaisons" | "Team";


export type AppNavItem = {
  label: AppNavLabel;
  href: string;
};

export function getPrimaryNavItems(role?: Role): AppNavItem[] {
  if (role === "designer") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Tasks", href: "/tasks" },
    ];
  }

  if (role === "client") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Projects", href: "/projects" },
      { label: "Liaisons", href: "/clients/liaisons" },
    ];
  }

  return [
    { label: "Home", href: "/dashboard" },
    { label: "Projects", href: "/projects" },
    { label: "Tasks", href: "/tasks" },
    { label: "Clients", href: "/clients" },
    { label: "Team", href: "/team" },
  ];
}
