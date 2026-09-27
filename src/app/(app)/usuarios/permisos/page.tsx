import type { Metadata } from "next";
import { PermissionMatrixView } from "./permission-matrix";

export const metadata: Metadata = { title: "Matriz de permisos" };

export default function PermissionsPage() {
  return <PermissionMatrixView />;
}
