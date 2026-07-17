import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Every page under /app/admin renders inside the unified AdminShell — persistent
 * sidebar, breadcrumb header, ⌘K palette. Pages just render their content; the
 * shell derives the breadcrumb title from the active route.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
