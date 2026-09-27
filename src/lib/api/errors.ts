/** Error del backend ya desempaquetado del envoltorio `{ success: false, error }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly path: string | undefined;
  /** Segundos de espera de un 429 (cabecera `Retry-After`), si llegó. */
  readonly retryAfter: number | null;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    path?: string;
    retryAfter?: number | null;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.path = opts.path;
    this.retryAfter = opts.retryAfter ?? null;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isTooManyRequests() {
    return this.status === 429;
  }
  /** 400/422: datos inválidos o regla de negocio (candado, D.O., …). */
  get isValidation() {
    return this.status === 400 || this.status === 422;
  }
}

/** Fallo de red (sin conexión, CORS, DNS). No hay respuesta del servidor. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("No se pudo conectar con el servidor.", { cause });
    this.name = "NetworkError";
  }
}

/** La respuesta no coincide con el esquema esperado: el contrato cambió. */
export class ContractError extends Error {
  readonly issues: unknown;
  constructor(path: string, issues: unknown) {
    super(`La respuesta de ${path} no coincide con el contrato esperado.`);
    this.name = "ContractError";
    this.issues = issues;
  }
}

/** "1 minuto", "5 minutos", "30 segundos": la espera de un 429 para mostrarla. */
export function waitLabel(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

/** Mensaje para la persona usuaria, en español, a partir de cualquier error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) return "El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.";
    if (error.isTooManyRequests) {
      return error.retryAfter
        ? `Demasiados intentos. Espera ${waitLabel(error.retryAfter)} y vuelve a intentarlo.`
        : "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
    }
    if (error.code === "AUTH_MFA_REQUIRED") {
      return "Falta el segundo factor en esta sesión: vuelve a entrar para verificarla.";
    }
    if (error.code === "PLATFORM_SUPERADMIN_PROTECTED") return error.message;
    if (error.isForbidden) return "No tienes permiso para esta acción.";
    return error.message;
  }
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ContractError) return "Recibimos datos inesperados del servidor.";
  return "Algo salió mal.";
}
