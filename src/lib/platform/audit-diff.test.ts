import { describe, expect, it } from "vitest";
import { auditDiff, formatAuditValue } from "./audit-diff";

// Antes y después de un evento de la bitácora.

describe("auditDiff", () => {
  it("une los campos de los dos lados y pone primero los que cambian", () => {
    expect(auditDiff({ status: "ACTIVE", region: "Tarija" }, { status: "SUSPENDED", region: "Tarija" })).toEqual([
      { key: "status", before: "ACTIVE", after: "SUSPENDED", changed: true },
      { key: "region", before: "Tarija", after: "Tarija", changed: false },
    ]);
    expect(auditDiff(null, { email: "a@x.test" })).toEqual([
      { key: "email", before: undefined, after: "a@x.test", changed: true },
    ]);
    expect(auditDiff(null, null)).toEqual([]);
  });

  it("formatea los valores para leerlos", () => {
    expect(formatAuditValue(null)).toBe("vacío");
    expect(formatAuditValue(undefined)).toBe("—");
    expect(formatAuditValue(true)).toBe("sí");
    expect(formatAuditValue(["A", "B"])).toBe("A, B");
    expect(formatAuditValue({ max: 300 })).toBe('{"max":300}');
  });
});
