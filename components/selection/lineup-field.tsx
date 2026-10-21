"use client";
import { Shirt } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { Profile } from "@/lib/domain";
import { POSITIONS, type LineupPlayer } from "@/lib/selection";
export function LineupField({
  players,
  profiles,
  open,
}: {
  players: LineupPlayer[];
  profiles: Profile[];
  open: (player: LineupPlayer) => void;
}) {
  return (
    <div
      className="selection-pitch"
      role="group"
      aria-label="Officiële opstelling: 3-0-3 met keeper"
    >
      <div className="pitch-markings" aria-hidden="true">
        <span className="pitch-half" />
        <span className="pitch-circle" />
        <span className="pitch-box pitch-box-top" />
        <span className="pitch-box pitch-box-bottom" />
      </div>
      <div className="pitch-players">
        {POSITIONS.map((position) => {
          const player = players.find((p) => p.position === position.id);
          const profile = profiles.find((p) => p.id === player?.user_id);
          const name =
            player?.player_name || profile?.display_name || "Nog te selecteren";
          return (
            <button
              key={position.id}
              className={`pitch-player ${player?.user_id ? "" : "pitch-vacant"}`}
              style={{ gridRow: position.row, gridColumn: position.column }}
              disabled={!player?.user_id}
              onClick={() => player && open(player)}
              aria-label={`${position.label}: ${name}, rugnummer ${player?.shirt_number || position.number}`}
            >
              <span className="player-portrait">
                {profile ? (
                  <Avatar name={name} path={profile.avatar_path} />
                ) : (
                  <Shirt size={28} aria-hidden="true" />
                )}
                <span className="player-number">
                  {player?.shirt_number || position.number}
                </span>
              </span>
              <strong>{name}</strong>
              {player?.nickname && (
                <span className="player-nickname">“{player.nickname}”</span>
              )}
              <span className="player-position">{position.label}</span>
            </button>
          );
        })}
      </div>
      <div className="pitch-caption">
        <span>3–0–3</span>
        <span>Middenveld? Overgeslagen.</span>
      </div>
    </div>
  );
}
