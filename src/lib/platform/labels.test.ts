import { describe, expect, it } from "vitest";
import { auditActionLabel, auditActorLabel, roleLabel } from "./labels";

describe("textos de la bitácora", () => {
  it("traduce los códigos conocidos y hace legible el resto", () => {
    expect(auditActionLabel("PLATFORM_USER_BLOCKED")).toBe("Usuario interno bloqueado");
    expect(auditActionLabel("LOT_CERTIFIED")).toBe("Lot certified");
  });

  it("nombra al actor o al sistema", () => {
    const base = { userId: null, fullName: null, role: null, organizationId: null, viaPlatform: false };
    expect(auditActorLabel(base)).toBe("Sistema");
    expect(auditActorLabel({ ...base, fullName: "Ana", role: "SUPERADMIN", viaPlatform: true })).toBe(
      "Ana · Superusuario",
    );
    expect(roleLabel("OPERATIONS")).toBe("Operaciones");
    expect(roleLabel(null)).toBe("—");
  });
});
