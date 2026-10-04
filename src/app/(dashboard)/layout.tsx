import type { ReactNode } from "react";
import { Dashboard } from "@/features/dashboard/components/dashboard";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Dashboard />
      {children}
    </>
  );
}
