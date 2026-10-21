"use client";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { rankRecordCounts } from "@/lib/record-ranking";
import type { CrewSummary, Profile } from "@/lib/domain";
export function RecordRanking({
  summaries,
  profiles,
}: {
  summaries: CrewSummary[];
  profiles: Profile[];
}) {
  const [label, setLabel] = useState("");
  const labels = [
    ...new Set(summaries.flatMap((s) => Object.keys(s.substance_counts))),
  ].sort((a, b) => a.localeCompare(b, "nl"));
  const rows = rankRecordCounts(summaries, profiles, label);
  return (
    <section
      className="card stack record-ranking"
      aria-label="Ranglijst registratiemomenten"
    >
      <div>
        <h2>Registratiemomenten</h2>
        <p className="muted text-sm mt-3">
          Meeste momenten bovenaan. Dit telt registraties, geen doses of
          hoeveelheden. Alleen jouw eigen en expliciet gedeelde gegevens staan
          hier.
        </p>
      </div>
      <label>
        Label ranglijst
        <select value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">Alle labels</option>
          {labels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      {rows.map((row) => (
        <div className="record-rank-row" key={row.userId}>
          <span className="muted text-sm">{row.rank}.</span>
          <Avatar
            name={row.name}
            path={profiles.find((p) => p.id === row.userId)?.avatar_path}
          />
          <strong>{row.name}</strong>
          <span>
            <b>{row.count}</b>
            <small>momenten</small>
          </span>
        </div>
      ))}
      {!rows.length && (
        <p className="empty">
          Geen toegestane registratiemomenten voor dit filter.
        </p>
      )}
      <p className="muted text-xs">
        De festivaldag hierboven geldt ook voor deze lijst. Registraties leveren
        geen punten of beloningen op.
      </p>
    </section>
  );
}
