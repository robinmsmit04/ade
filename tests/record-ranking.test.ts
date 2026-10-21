import { describe, it, expect } from "vitest";
import { rankRecordCounts } from "../lib/record-ranking";
const profiles = [
  { id: "a", display_name: "Alex" },
  { id: "b", display_name: "Bo" },
  { id: "c", display_name: "Casey" },
];
const summary = (
  user_id: string,
  substance_counts: Record<string, number>,
) => ({
  user_id,
  substance_counts,
  last_substance: "SOS",
  last_taken_at: "2026-01-01T12:00:00Z",
  today_count: 0,
});
describe("record count ranking, without dose assumptions", () => {
  it("counts all provided moments and gives equal counts the same rank", () => {
    expect(
      rankRecordCounts(
        [
          summary("c", { SOS: 2 }),
          summary("b", { XTC: 2, Joint: 1 }),
          summary("a", { MDMA: 3 }),
        ],
        profiles,
      ).map((r) => [r.userId, r.count, r.rank]),
    ).toEqual([
      ["a", 3, 1],
      ["b", 3, 1],
      ["c", 2, 3],
    ]);
  });
  it("filters exact labels without treating XTC as MDMA or showing zero/absent users", () => {
    expect(
      rankRecordCounts(
        [summary("a", { XTC: 3, MDMA: 1 }), summary("b", { MDMA: 2 })],
        profiles,
        "XTC",
      ).map((r) => [r.userId, r.count]),
    ).toEqual([["a", 3]]);
    expect(rankRecordCounts([], profiles)).toEqual([]);
  });
});
