import type { ReactNode } from "react";
export type Role =
  "SuperAdmin" | "FleetOperator" | "MaintenanceTech" | "Auditor";
export type Permission = "read" | "write" | "ack";
const permissions: Record<Role, readonly Permission[]> = {
  SuperAdmin: ["read", "write", "ack"],
  FleetOperator: ["read", "write", "ack"],
  MaintenanceTech: ["read", "ack"],
  Auditor: ["read"],
};
/** Presentation only; the API must independently enforce every permission. */
export function HasPermission({
  role,
  permission,
  children,
}: {
  role: Role;
  permission: Permission;
  children: ReactNode;
}) {
  return permissions[role].includes(permission) ? children : null;
}
