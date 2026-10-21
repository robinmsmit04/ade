"use client";
import { ChevronRight, Lock, Clock } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  elapsed,
  formatDate,
  type CrewSummary,
  type Profile,
  type Member,
} from "@/lib/domain";
export function CrewOverview({
  members,
  profiles,
  summaries,
  parties = [],
  uid,
  open,
  compact = false,
  dayLabel = "vandaag",
}: {
  members: Member[];
  profiles: Profile[];
  summaries: CrewSummary[];
  parties?: { user_id: string; ended_at: string | null }[];
  uid: string;
  open: (id: string) => void;
  compact?: boolean;
  dayLabel?: string;
}) {
  const people = [...members]
    .filter((m) => !compact || m.user_id !== uid)
    .sort((a, b) =>
      (
        profiles.find((p) => p.id === a.user_id)?.display_name || ""
      ).localeCompare(
        profiles.find((p) => p.id === b.user_id)?.display_name || "",
        "nl",
      ),
    );
  return (
    <div className="crew-list">
      {people.slice(0, compact ? 6 : undefined).map((member) => {
        const profile = profiles.find((p) => p.id === member.user_id);
        const summary = summaries.find((s) => s.user_id === member.user_id);
        const ended = parties.find(
          (p) => p.user_id === member.user_id,
        )?.ended_at;
        return (
          <button
            key={member.user_id}
            className="person-row"
            onClick={() => open(member.user_id)}
            aria-label={`Tijdlijn van ${profile?.display_name || "Crewlid"}`}
          >
            <Avatar
              name={profile?.display_name || "Crewlid"}
              path={profile?.avatar_path}
            />
            <span className="person-copy">
              <strong>
                {profile?.display_name || "Crewlid"}
                {member.user_id === uid ? " (jij)" : ""}
              </strong>
              {summary ? (
                <>
                  <span className="person-latest">
                    {summary.last_substance}
                    <span>
                      {" "}
                      ·{" "}
                      {ended
                        ? "Feest afgerond"
                        : `${elapsed(summary.last_taken_at)} geleden`}
                    </span>
                  </span>
                  <small>
                    <Clock size={11} />
                    {formatDate(summary.last_taken_at)} · {summary.today_count}{" "}
                    momenten {dayLabel}
                  </small>
                </>
              ) : (
                <small>
                  <Lock size={12} />
                  Geen gedeelde registraties
                </small>
              )}
            </span>
            <ChevronRight size={17} className="muted shrink-0" />
          </button>
        );
      })}
      {!people.length && (
        <p className="empty">
          Je vrienden verschijnen hier zodra ze aansluiten. Deel je website of
          een crew-uitnodiging.
        </p>
      )}
    </div>
  );
}
