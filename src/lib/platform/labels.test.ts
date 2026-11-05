import { describe, expect, it } from "vitest";
import { auditActionLabel, auditActorLabel, resourceTypeLabel, roleLabel } from "./labels";

describe("textos de la bitácora", () => {
  it("traduce los códigos conocidos y hace legible el resto", () => {
    expect(auditActionLabel("PLATFORM_USER_BLOCKED")).toBe("Usuario interno bloqueado");
    expect(auditActionLabel("LOT_CERTIFIED")).toBe("Lot certified");
    expect(auditActionLabel("AUTH_LOGIN_SUCCEEDED")).toBe("Inicio de sesión");
    // Ola 3: tokenización y cadena.
    expect(auditActionLabel("TOKENIZATION_APPROVED")).toBe("Tokenización aprobada");
    expect(auditActionLabel("CHAIN_CONTRACT_PAUSED")).toBe("Contrato pausado en la red");
    expect(auditActionLabel("LOT_CLOSURE_DECIDED")).toBe("Cierre con faltante decidido");
  });

  it("nombra los tipos de recurso en snake_case", () => {
    expect(resourceTypeLabel("winery_application")).toBe("Solicitud");
    expect(resourceTypeLabel("wine_aging_batch")).toBe("Crianza");
    expect(resourceTypeLabel("tokenization_request")).toBe("Solicitud de tokenización");
    expect(resourceTypeLabel("chain_transaction")).toBe("Transacción de la red");
    expect(resourceTypeLabel("pickup_point")).toBe("Pickup point");
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
