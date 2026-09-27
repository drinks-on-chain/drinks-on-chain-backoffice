import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WineryApplication } from "@drinks-on-chain/mocks";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { fail, ok, renderWithQuery, staffMe, stubFetch } from "@/test/utils";
import { ApproveDialog, ScheduleMeetingDialog } from "./application-dialogs";

// Aprobar (dueño por defecto el contacto, editable) y agendar la reunión (hora local → ISO).

const application: WineryApplication = {
  id: "app-1",
  status: "IN_REVIEW",
  createdAt: "2026-09-20T10:00:00Z",
  updatedAt: "2026-09-21T10:00:00Z",
  legalName: "Vinos Artesanales Chocloca S.R.L.",
  tradeName: "Vinos Artesanales Chocloca",
  taxId: "7099887711",
  category: "WINERY",
  region: "Valle Central de Tarija · Chocloca",
  contactName: "Ana María Tolaba",
  contactEmail: "anamaria@chocloca.test",
  contactPhone: null,
  message: null,
  assignee: { userId: "u-ops", fullName: "Valeria Méndez" },
  meeting: null,
  decision: null,
  wineryId: null,
  notes: [],
};

describe("diálogos de la solicitud", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    setSession({ accessToken: "a", expiresIn: 900 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  it("aprobar propone al contacto como dueño y marca los details del 422", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(422, "VALIDATION_ERROR", "Datos inválidos", [{ field: "ownerEmail", message: "El correo no es válido" }]),
    );
    renderWithQuery(<ApproveDialog application={application} onClose={() => {}} onApproved={() => {}} />, {
      me: staffMe("OPERATIONS"),
    });
    expect(screen.getByRole("textbox", { name: /^Nombre del dueño/ })).toHaveValue("Ana María Tolaba");
    const email = screen.getByRole("textbox", { name: /^Correo del dueño/ });
    expect(email).toHaveValue("anamaria@chocloca.test");
    fireEvent.change(email, { target: { value: "gerencia@chocloca.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Aprobar y enviar la invitación" }));

    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("El correo no es válido")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/platform/winery-applications/app-1/approve");
    expect(JSON.parse(String(init!.body))).toEqual({
      ownerFullName: "Ana María Tolaba",
      ownerEmail: "gerencia@chocloca.test",
    });
  });

  it("una transición inválida (409) se explica sin marcar campos", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(409, "APPLICATION_INVALID_TRANSITION", "No puede pasar de APPROVED a APPROVED"),
    );
    // Tras el error se recarga el detalle.
    fetchMock.mockResolvedValue(ok({ ...application, status: "APPROVED" }));
    renderWithQuery(<ApproveDialog application={application} onClose={() => {}} onApproved={() => {}} />, {
      me: staffMe("OPERATIONS"),
    });
    await userEvent.click(screen.getByRole("button", { name: "Aprobar y enviar la invitación" }));
    expect(await screen.findByText(/cambió de estado mientras la mirabas/)).toBeInTheDocument();
  });

  it("agendar exige fecha y envía la hora local como ISO", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...application, status: "MEETING_SCHEDULED" }));
    const onClose = vi.fn();
    const { container } = renderWithQuery(<ScheduleMeetingDialog application={application} onClose={onClose} />, {
      me: staffMe("OPERATIONS"),
    });
    await userEvent.click(screen.getByRole("button", { name: "Agendar" }));
    expect(await screen.findByText("Elige la fecha y la hora.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const input = (container.ownerDocument.querySelector('input[type="datetime-local"]') as HTMLInputElement)!;
    fireEvent.change(input, { target: { value: "2026-10-03T10:30" } });
    await userEvent.click(screen.getByRole("radio", { name: "En persona" }));
    await userEvent.click(screen.getByRole("button", { name: "Agendar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).toEqual({
      scheduledAt: new Date("2026-10-03T10:30").toISOString(),
      channel: "IN_PERSON",
      notes: null,
    });
  });
});
