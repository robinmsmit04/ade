export const difficultyLabels: Record<string, string> = {
  Easy: "🟢 Makkelijk",
  Awkward: "🟠 Medium",
  "No Shame": "Uitdagend",
  Legendary: "🔴 Bijna onmogelijk",
};
export function difficultyLabel(value: string) {
  return difficultyLabels[value] || value;
}
