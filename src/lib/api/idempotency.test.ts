import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "./errors";
import { createIdempotency, runIdempotent } from "./idempotency";

const counter = () => {
  let n = 0;
  return () => `k${++n}`;
};

describe("Idempotency-Key por intención", () => {
  it("repite la clave con el mismo cuerpo y la cambia si el cuerpo cambia", () => {
    const idem = createIdempotency(counter());
    expect(idem.keyFor({ reason: "a" })).toBe("k1");
    expect(idem.keyFor({ reason: "a" })).toBe("k1");
    expect(idem.keyFor({ reason: "b" })).toBe("k2");
    idem.done();
    expect(idem.keyFor({ reason: "b" })).toBe("k3");
  });

  it("tras un fallo de red el reintento viaja con la misma clave", async () => {
    const idem = createIdempotency(counter());
    const keys: string[] = [];
    const send = (fail: boolean) => (key: string) => {
      keys.push(key);
      return fail ? Promise.reject(new NetworkError("sin red")) : Promise.resolve("ok");
    };
    await expect(runIdempotent(idem, { a: 1 }, send(true))).rejects.toBeInstanceOf(NetworkError);
    await expect(runIdempotent(idem, { a: 1 }, send(false))).resolves.toBe("ok");
    expect(keys).toEqual(["k1", "k1"]);
    // Terminada la intención, la siguiente acción estrena clave.
    await runIdempotent(idem, { a: 1 }, send(false));
    expect(keys[2]).toBe("k2");
  });

  it("si el servidor responde con un error, la siguiente acción usa otra clave", async () => {
    const idem = createIdempotency(counter());
    const keys: string[] = [];
    const conflict = new ApiError({ status: 409, code: "TOK_WINERY_CHAIN_NOT_READY", message: "x" });
    await expect(
      runIdempotent(idem, {}, (key) => {
        keys.push(key);
        return Promise.reject(conflict);
      }),
    ).rejects.toBe(conflict);
    await runIdempotent(idem, {}, (key) => {
      keys.push(key);
      return Promise.resolve(null);
    });
    expect(keys).toEqual(["k1", "k2"]);
  });
});
