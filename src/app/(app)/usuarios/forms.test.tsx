import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlatformUser } from "@drinks-on-chain/mocks";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { fail, ok, renderWithQuery, stubFetch } from "@/test/utils";
import { InviteUserDialog } from "./invite-user-dialog";
import { UserActionDialog } from "./user-action-dialog";

// Formularios de usuarios internos: cada `details[].field` de un 422 se marca en su campo.

const invitation = {
  id: "inv-1",
  email: "nuevo@drinksonchain.test",
  organizationId: "platform",
  organizationType: "PLATFORM",
  organizationName: "Drinks on Chain",
  role: "SUPPORT",
  status: "PENDING",
  expiresAt: "2026-09-30T12:00:00Z",
  createdAt: "2026-09-27T12:00:00Z",
  invitedBy: { userId: "u1", fullName: "Ana", viaPlatform: true },
};

describe("invitar a un usuario interno", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    setSession({ accessToken: "a", expiresIn: 900 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  it("marca el correo y el motivo con los details del 422", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(422, "VALIDATION_ERROR", "Datos inválidos", [
        { field: "email", message: "El correo no es válido" },
        { field: "reason", message: "Debe tener al menos 3 caracteres" },
      ]),
    );
    renderWithQuery(<InviteUserDialog open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), "no-es-correo");
    await userEvent.click(screen.getByRole("button", { name: "Enviar la invitación" }));

    const email = screen.getByLabelText(/Correo electrónico/);
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("El correo no es válido")).toBeInTheDocument();
    expect(screen.getByLabelText(/Motivo/)).toHaveAttribute("aria-invalid", "true");
    // La petición lleva el rol por defecto y no manda un motivo vacío.
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).toEqual({ email: "no-es-correo", role: "OPERATIONS" });
  });

  it("un correo ya invitado o miembro (409) se marca en el correo", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(409, "INVITATION_ALREADY_PENDING", "Ya hay una invitación pendiente para ese correo"),
    );
    renderWithQuery(<InviteUserDialog open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), "soporte@drinksonchain.test");
    await userEvent.click(screen.getByRole("button", { name: "Enviar la invitación" }));
    await waitFor(() => expect(screen.getByLabelText(/Correo electrónico/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Ya hay una invitación pendiente para ese correo")).toBeInTheDocument();
  });

  it("al enviarla se cierra", async () => {
    fetchMock.mockResolvedValueOnce(ok(invitation, 201));
    const onOpenChange = vi.fn();
    renderWithQuery(<InviteUserDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), "nuevo@drinksonchain.test");
    await userEvent.click(screen.getByRole("button", { name: "Enviar la invitación" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("acciones con motivo sobre un usuario interno", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  const user = {
    membershipId: "pm-2",
    userId: "u-2",
    fullName: "Pablo Rivera",
    email: "soporte@drinksonchain.test",
    role: "SUPPORT",
    status: "ACTIVE",
    blockedBy: null,
    blockedReason: null,
    joinedAt: "2026-01-01T00:00:00Z",
    lastLoginAt: null,
    mfaEnabled: true,
    invitationId: null,
  } satisfies PlatformUser;

  beforeEach(() => {
    fetchMock = stubFetch();
    setSession({ accessToken: "a", expiresIn: 900 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  it("exige el motivo antes de llamar al backend", async () => {
    renderWithQuery(<UserActionDialog dialog={{ kind: "block", user }} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByText(/mínimo 3 caracteres/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marca el motivo con el details del 422 y avisa de un 403 dentro del diálogo", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(422, "VALIDATION_ERROR", "Datos inválidos", [
        { field: "reason", message: "El motivo es demasiado genérico" },
      ]),
    );
    fetchMock.mockResolvedValueOnce(fail(403, "FORBIDDEN", "Requiere rol ADMIN"));
    renderWithQuery(<UserActionDialog dialog={{ kind: "block", user }} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/Motivo/), "porque sí");
    await userEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByText("El motivo es demasiado genérico")).toBeInTheDocument();
    expect(screen.getByLabelText(/Motivo/)).toHaveAttribute("aria-invalid", "true");

    await userEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByText("No tienes permiso para esta acción.")).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/platform/users/pm-2/block");
    expect(JSON.parse(String(init!.body))).toEqual({ reason: "porque sí" });
  });
});
