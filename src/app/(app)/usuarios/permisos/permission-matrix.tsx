"use client";

import { Card, ErrorState, RoleMatrix, SkeletonText } from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { roleLabel } from "@/lib/platform/labels";
import { usePermissionMatrix } from "@/lib/platform/hooks";
import { platformRole } from "@/lib/platform/permissions";

// Roles de las organizaciones de la Ola 1: plataforma y bodega (los de los puntos de canje llegan
// con la Ola 5).
const ROLES = ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT", "OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR", "ACCOUNTANT"];

/** Matriz de permisos (PLT-04, `GET /v1/platform/permissions`): la lee todo el personal interno. */
export function PermissionMatrixView() {
  const me = useMe();
  const matrix = usePermissionMatrix();
  const mine = platformRole(me.data);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Matriz de permisos"
        description="Qué puede hacer cada rol en el back office y en las bodegas. La decide el backend; tu columna está resaltada."
      />
      <Card className="p-4">
        {matrix.isPending ? (
          <SkeletonText lines={8} />
        ) : matrix.isError ? (
          <ErrorState
            bare
            title="No se pudo cargar la matriz"
            description={errorMessage(matrix.error)}
            onRetry={() => matrix.refetch()}
            retrying={matrix.isFetching}
          />
        ) : (
          <RoleMatrix
            caption="Capacidades por rol"
            density="compact"
            highlightRole={mine ?? undefined}
            capabilities={matrix.data.capabilities}
            roles={ROLES.map((key) => ({ key, label: roleLabel(key) }))}
            labels={{ capability: "Capacidad" }}
          />
        )}
      </Card>
    </div>
  );
}
