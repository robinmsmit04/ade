import { describe, it, expect } from "vitest";
import { POSITIONS, emptyLineup, validateLineup } from "../lib/selection";
describe("official ADE formation validation", () => {
  it("has three attackers, three central defenders and one keeper in three visual rows", () => {
    expect(POSITIONS.filter((p) => p.row === 1)).toHaveLength(3);
    expect(POSITIONS.filter((p) => p.row === 2)).toHaveLength(3);
    expect(POSITIONS.filter((p) => p.row === 3)).toHaveLength(1);
    expect(POSITIONS.find((p) => p.row === 3)?.id).toBe("keeper");
    expect(() => validateLineup(emptyLineup())).not.toThrow();
  });
  it("rejects duplicate accounts and numbers, unknown positions and invalid shirt numbers", () => {
    const p = emptyLineup();
    p[0].user_id = "same";
    p[1].user_id = "same";
    expect(() => validateLineup(p)).toThrow(/één positie/);
    p[1].user_id = "other";
    p[1].shirt_number = p[0].shirt_number;
    expect(() => validateLineup(p)).toThrow(/rugnummers/);
    p[1].shirt_number = 2.5;
    expect(() => validateLineup(p)).toThrow(/rugnummers/);
    expect(() => validateLineup(emptyLineup().slice(1))).toThrow(/zeven/);
  });
});
