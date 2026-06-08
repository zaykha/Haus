import { BottomNav } from "@/components/ui";
import { RequireAuth } from "@/components/require-auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="app-layout">
        <div className="app-content">{children}</div>
        <BottomNav />
      </div>
    </RequireAuth>
  );
}
