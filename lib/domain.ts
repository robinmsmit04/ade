import { z } from "zod";
export const recordSchema = z.object({
  substance: z.string().trim().min(1, "Vul een middel in").max(60),
  taken_at: z
    .string()
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now() + 60000,
      "Kies een geldig tijdstip in het verleden",
    ),
  quantity: z.string().trim().max(60),
  notes: z.string().trim().max(1000),
});
export const challengeSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  evidence: z.string().trim().min(5).max(1000),
  festival: z.enum(["ADE", "DGTL", "KI/KI"]),
  difficulty: z.enum(["Easy", "Awkward", "No Shame", "Legendary"]),
  points: z.coerce.number().int().min(1).max(1000),
  repeatable: z.boolean(),
});
export const authSchema = z.object({
  email: z.email("Vul een geldig e-mailadres in"),
  password: z.string().min(10, "Gebruik minimaal 10 tekens").max(128),
});
export function elapsed(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}u ${minutes % 60}m`;
}
export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
export function localInput(iso = new Date().toISOString()) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function validateMedia(file: Pick<File, "type" | "size">) {
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ].includes(file.type)
  )
    throw new Error("Kies JPG, PNG, WebP, MP4, MOV of WebM.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Bestand is groter dan 25 MB.");
  if (file.size === 0) throw new Error("Het bestand is leeg.");
}
export type Profile = {
  id: string;
  display_name: string;
  avatar_path?: string | null;
  profile_completed_at?: string | null;
  onboarding_completed_at?: string | null;
  active_crew_id?: string | null;
};
export type Crew = { id: string; name: string; review_threshold: number };
export type Member = {
  user_id: string;
  role: "admin" | "member";
  crew_id: string;
};
export type RecordEntry = {
  id: string;
  user_id: string;
  crew_id: string;
  substance: string;
  taken_at: string;
  quantity: string;
  notes: string;
};
export type Checkin = {
  id: string;
  user_id: string;
  status: string;
  help_requested: boolean;
  shared: boolean;
  created_at: string;
};
export type Challenge = {
  id: string;
  crew_id: string;
  title: string;
  description: string;
  evidence: string;
  festival: "ADE" | "DGTL" | "KI/KI";
  difficulty: "Easy" | "Awkward" | "No Shame" | "Legendary";
  points: number;
  repeatable: boolean;
  active: boolean;
};
export type Submission = {
  id: string;
  user_id: string;
  crew_id: string;
  challenge_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  file_path: string;
  mime_type: string;
  festival: string;
  title: string;
  points: number;
};
export type Award = {
  id: string;
  user_id: string;
  crew_id: string;
  submission_id: string;
  points: number;
  festival: string;
  created_at: string;
};

export function dayKey(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
export type CrewSummary = {
  user_id: string;
  last_substance: string;
  last_taken_at: string;
  today_count: number;
  substance_counts: Record<string, number>;
};
