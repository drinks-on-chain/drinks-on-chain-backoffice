import { expect, test, type Page } from "@playwright/test";
import { STAFF, login, settled, trackErrors } from "./support";

// 4B · Solicitudes: tomar → reunión → aprobar → correo de invitación del dueño en el buzón
// simulado → aceptar (la aceptación del dueño es del ERP: se hace con la API de los mocks) →
// bodega ACTIVE con su prefijo de lote. Rechazar con motivo y la paleta "Ir a solicitud…".

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test("de solicitud recibida a bodega activa con prefijo de lote", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.operations);
  await page.getByRole("link", { name: "Solicitudes", exact: true }).click();
  await settled(page);
  await page.getByRole("combobox", { name: "Estado" }).click();
  await page.getByRole("option", { name: "Recibida" }).click();
  await expect(page).toHaveURL(/estado=RECEIVED/);
  await page.getByRole("link", { name: "Vinos Artesanales Chocloca" }).click();
  await expect(page.getByRole("heading", { name: "Vinos Artesanales Chocloca", level: 1 })).toBeVisible();

  // Tomar: pasa a revisión y queda asignada.
  await page.getByRole("button", { name: "Tomar la solicitud" }).click();
  await expect(page.getByText("Solicitud tomada: ahora está en revisión y asignada a ti.", { exact: true })).toBeVisible();
  await expect(page.getByText("En revisión", { exact: true }).first()).toBeVisible();

  // Reunión agendada y registrada.
  await page.getByRole("button", { name: "Agendar reunión" }).click();
  const meeting = page.getByRole("dialog", { name: "Agendar una reunión" });
  await meeting.getByLabel("Fecha y hora").fill("2026-10-03T10:30");
  await meeting.getByRole("radio", { name: "Llamada", exact: true }).check();
  await meeting.getByRole("button", { name: "Agendar" }).click();
  await expect(page.getByText("Reunión agendada.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Registrar la reunión" }).click();
  const done = page.getByRole("dialog", { name: "Registrar la reunión" });
  await done.getByLabel("Cómo fue la reunión").fill("Conocen la preventa y tienen el registro SENASAG al día.");
  await done.getByRole("button", { name: "Guardar y volver a revisión" }).click();
  await expect(page.getByText("Reunión registrada: la solicitud vuelve a revisión.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Notas de la solicitud" })).toContainText("registro SENASAG");

  // Aprobar: el dueño por defecto es el contacto.
  await page.getByRole("button", { name: "Aprobar", exact: true }).click();
  const approve = page.getByRole("dialog", { name: "Aprobar Vinos Artesanales Chocloca" });
  await expect(approve.getByLabel("Correo del dueño")).toHaveValue("anamaria@chocloca.test");
  await approve.getByRole("button", { name: "Aprobar y enviar la invitación" }).click();
  const notice = page.getByRole("status").filter({ hasText: "Bodega creada e invitación enviada" });
  await expect(notice).toContainText("anamaria@chocloca.test");
  await expect(page.getByText("Aprobada", { exact: true }).first()).toBeVisible();

  // La bodega queda INVITED, sin prefijo, con el dueño pendiente.
  await notice.getByRole("link", { name: "Vinos Artesanales Chocloca" }).click();
  await expect(page.getByRole("heading", { name: "Vinos Artesanales Chocloca", level: 1 })).toBeVisible();
  await expect(page.getByText("Invitada", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Se asigna al activarse (definitivo).", { exact: true })).toBeVisible();
  const wineryUrl = page.url();

  // El correo de invitación llega al buzón simulado con el enlace al ERP.
  await page.goto("/__mocks");
  await page.getByLabel("Filtrar por destinatario").fill("anamaria@chocloca.test");
  const mail = row(page, "INVITATION");
  await expect(mail).toHaveCount(1);
  const href = await mail.getByRole("link").getAttribute("href");
  expect(href).toMatch(/^http:\/\/localhost:3002\/invitacion\/.+/);
  const token = decodeURIComponent(new URL(href!).pathname.split("/").pop()!);

  // La aceptación del dueño (cuenta nueva) es del ERP: se hace con la API de los mocks, sin sesión.
  const accepted = await page.evaluate(async (t) => {
    const res = await fetch(`/api/v1/invitations/${encodeURIComponent(t)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-App": "ERP" },
      body: JSON.stringify({ fullName: "Ana María Tolaba", password: "vendimia-2026" }),
    });
    return res.status;
  }, token);
  expect(accepted).toBe(200);

  // Los mocks dejan la cookie de la sesión de la dueña (como haría el ERP): el back office no es
  // para ella (ofrece el ERP); se cierra su sesión y se vuelve a entrar como operaciones.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Este acceso no es para el back office" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, STAFF.operations);
  await page.goto(wineryUrl);
  await settled(page);
  await expect(page.getByText("Activa", { exact: true }).first()).toBeVisible();
  const prefix = page.getByTitle("Prefijo de los códigos de lote");
  await expect(prefix).toHaveText(/^[A-Z]{3,5}$/);
  await page.getByRole("tab", { name: /Equipo/ }).click();
  await expect(row(page, "Ana María Tolaba")).toContainText("Dueño");
  expect(errors).toEqual([]);
});

test("rechazar con motivo y buscar una solicitud desde la paleta", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.operations);

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
  await page.keyboard.type("Tierra de Cintis");
  await expect(palette.getByRole("option", { name: /Bodega Tierra de Cintis/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Bodega Tierra de Cintis", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Rechazar" }).click();
  const dialog = page.getByRole("alertdialog", { name: /Rechazar la solicitud/ });
  await dialog.getByLabel("Motivo").fill("No produce con uva de la región todavía");
  await dialog.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByText("Solicitud de Bodega Tierra de Cintis rechazada.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rechazada" })).toBeVisible();
  await expect(page.getByText("No produce con uva de la región todavía").first()).toBeVisible();
  expect(errors).toEqual([]);
});
