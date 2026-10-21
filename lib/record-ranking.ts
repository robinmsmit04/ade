import type { CrewSummary, Profile } from "./domain";
export function rankRecordCounts(
  summaries: CrewSummary[],
  profiles: Profile[],
  label = "",
) {
  const rows = summaries
    .map((s) => ({
      userId: s.user_id,
      name: profiles.find((p) => p.id === s.user_id)?.display_name || "Crewlid",
      count: label
        ? s.substance_counts[label] || 0
        : Object.values(s.substance_counts).reduce((a, b) => a + b, 0),
    }))
    .filter((r) => r.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name, "nl") ||
        a.userId.localeCompare(b.userId),
    );
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.count !== rows[i - 1].count) rank = i + 1;
    return { ...row, rank };
  });
}
