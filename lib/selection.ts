export const POSITIONS = [
  { id: "forward_left", label: "Linksvoor", number: 7, row: 1, column: 1 },
  { id: "striker", label: "Spits", number: 9, row: 1, column: 2 },
  { id: "forward_right", label: "Rechtsvoor", number: 11, row: 1, column: 3 },
  { id: "cv_left", label: "CV Links", number: 3, row: 2, column: 1 },
  { id: "cv_center", label: "CV Centraal", number: 4, row: 2, column: 2 },
  { id: "cv_right", label: "CV Rechts", number: 5, row: 2, column: 3 },
  { id: "keeper", label: "Keeper", number: 1, row: 3, column: 2 },
] as const;
export type Position = (typeof POSITIONS)[number]["id"];
export type LineupPlayer = {
  position: Position;
  user_id: string | null;
  player_name: string;
  nickname: string;
  shirt_number: number;
};
export type TeamSettings = { manager_id: string | null; version: number };
export type MatchReport = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};
export function emptyLineup(): LineupPlayer[] {
  return POSITIONS.map((p) => ({
    position: p.id,
    user_id: null,
    player_name: "",
    nickname: "",
    shirt_number: p.number,
  }));
}
export function validateLineup(players: LineupPlayer[]) {
  if (
    players.length !== 7 ||
    new Set(players.map((p) => p.position)).size !== 7 ||
    players.some(
      (p) => !POSITIONS.some((position) => position.id === p.position),
    )
  )
    throw new Error("De opstelling bestaat uit precies zeven vaste posities.");
  const assigned = players.filter((p) => p.user_id);
  if (new Set(assigned.map((p) => p.user_id)).size !== assigned.length)
    throw new Error(
      "Een speler kan maar op één positie staan. Wissel de accounts of maak eerst een positie vrij.",
    );
  if (
    new Set(players.map((p) => p.shirt_number)).size !== 7 ||
    players.some(
      (p) =>
        !Number.isInteger(p.shirt_number) ||
        p.shirt_number < 1 ||
        p.shirt_number > 99,
    )
  )
    throw new Error("Kies zeven verschillende rugnummers van 1 t/m 99.");
  if (
    players.some(
      (p) => p.player_name.trim().length > 60 || p.nickname.trim().length > 60,
    )
  )
    throw new Error("Naam en bijnaam mogen maximaal 60 tekens hebben.");
}
