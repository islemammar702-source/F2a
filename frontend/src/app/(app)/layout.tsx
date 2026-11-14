import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <AppShell area="staff">{children}</AppShell>;
}
