import { describe, it, expect } from "vitest";
import {
  authSchema,
  challengeSchema,
  elapsed,
  formatDate,
  recordSchema,
  validateMedia,
} from "../lib/domain";
describe("historische registraties", () => {
  const valid = {
    substance: "  Eigen registratie  ",
    taken_at: "2026-01-01T12:00:00Z",
    quantity: "",
    notes: "",
  };
  it("normaliseert invoer en bewaart een exact tijdstip", () => {
    const result = recordSchema.parse(valid);
    expect(result.substance).toBe("Eigen registratie");
    expect(result.taken_at).toBe(valid.taken_at);
  });
  it("weigert toekomst, ongeldige datum en leeg middel", () => {
    for (const patch of [
      { taken_at: "invalid" },
      { taken_at: new Date(Date.now() + 3600000).toISOString() },
      { substance: "  " },
      { notes: "x".repeat(1001) },
    ])
      expect(recordSchema.safeParse({ ...valid, ...patch }).success).toBe(
        false,
      );
  });
  it("toont verstreken tijd zonder hergebruiksadvies", () => {
    expect(
      elapsed("2026-01-01T12:00:00Z", Date.parse("2026-01-01T13:35:00Z")),
    ).toBe("1u 35m");
    expect(elapsed("2026-01-01T12:00:00Z", 0)).toBe("0 min");
  });
  it("toont Amsterdamse tijd ook buiten de Nederlandse tijdzone", () => {
    expect(formatDate("2026-01-01T12:00:00Z")).toContain("13:00");
    expect(formatDate("2026-07-01T12:00:00Z")).toContain("14:00");
  });
});
describe("invoervalidatie", () => {
  it("vereist een geldig e-mailadres en lang wachtwoord", () => {
    expect(
      authSchema.safeParse({ email: "nee", password: "kort" }).success,
    ).toBe(false);
    expect(
      authSchema.safeParse({
        email: "crew@example.com",
        password: "a-long-password",
      }).success,
    ).toBe(true);
  });
  it("beperkt bewijs tot ondersteunde media en 25 MB", () => {
    expect(() => validateMedia({ type: "text/html", size: 30 })).toThrow();
    expect(() =>
      validateMedia({ type: "image/jpeg", size: 26 * 1024 * 1024 }),
    ).toThrow();
    expect(() => validateMedia({ type: "image/jpeg", size: 0 })).toThrow();
    expect(() =>
      validateMedia({ type: "video/mp4", size: 1024 }),
    ).not.toThrow();
  });
  it("valideert challengepunten, niveau en festival", () => {
    const c = {
      title: "Crewfoto",
      description: "Een leuke groepsfoto.",
      evidence: "Foto met toestemming.",
      festival: "DGTL",
      difficulty: "Easy",
      points: 10,
      repeatable: false,
    };
    expect(challengeSchema.safeParse(c).success).toBe(true);
    for (const patch of [
      { points: -10 },
      { points: 1.2 },
      { points: 1001 },
      { festival: "anders" },
      { difficulty: "onbekend" },
    ])
      expect(challengeSchema.safeParse({ ...c, ...patch }).success).toBe(false);
  });
});
