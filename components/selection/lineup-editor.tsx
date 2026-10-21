"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { socialError } from "@/components/social/use-social";
import { POSITIONS, validateLineup, type LineupPlayer } from "@/lib/selection";
import type { Profile } from "@/lib/domain";
export function LineupEditor({
  cid,
  players,
  profiles,
  version,
  saved,
}: {
  cid: string;
  players: LineupPlayer[];
  profiles: Profile[];
  version: number;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => players.map((p) => ({ ...p })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  function change(position: string, values: Partial<LineupPlayer>) {
    setDraft((rows) =>
      rows.map((p) => (p.position === position ? { ...p, ...values } : p)),
    );
  }
  function selectAccount(position: string, userId: string) {
    // Selecting an occupied account swaps the players, preserving one account per position.
    setDraft((rows) => {
      const target = rows.find((p) => p.position === position)!;
      const previous = rows.find(
        (p) => p.user_id === userId && userId && p.position !== position,
      );
      const selected = profiles.find((p) => p.id === userId);
      return rows.map((p) =>
        p.position === position
          ? {
              ...p,
              user_id: userId || null,
              player_name:
                previous?.player_name || selected?.display_name || "",
              nickname: previous?.nickname || "",
            }
          : p === previous
            ? {
                ...p,
                user_id: target.user_id,
                player_name: target.player_name,
                nickname: target.nickname,
              }
            : p,
      );
    });
  }
  return (
    <form
      className="stack lineup-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          validateLineup(draft);
          const result = await getSupabase().rpc("save_team_lineup", {
            cid,
            players: draft,
            expected_version: version,
          });
          if (result.error) throw result.error;
          await saved();
        } catch (e) {
          setError(socialError(e));
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <p className="muted text-sm">
        Zeven plekken, één tactisch meesterplan. Koppel accounts aan posities;
        hun eigen profielfoto verschijnt op het veld. Een bezette speler kiezen
        wisselt beide spelers om.
      </p>
      {POSITIONS.map((position) => {
        const p = draft.find((p) => p.position === position.id)!;
        return (
          <fieldset
            key={position.id}
            disabled={busy}
            className="lineup-editor-row"
          >
            <legend>{position.label}</legend>
            <label>
              Account · {position.label}
              <select
                aria-label={`Account · ${position.label}`}
                value={p.user_id || ""}
                onChange={(e) => selectAccount(position.id, e.target.value)}
              >
                <option value="">Nog niet ingevuld</option>
                {profiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {profile.display_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="lineup-editor-details">
              <label>
                Naam · {position.label}
                <input
                  maxLength={60}
                  value={p.player_name}
                  disabled={!p.user_id}
                  onChange={(e) =>
                    change(position.id, { player_name: e.target.value })
                  }
                />
              </label>
              <label>
                Bijnaam · {position.label}
                <input
                  maxLength={60}
                  value={p.nickname}
                  disabled={!p.user_id}
                  placeholder="De stofzuiger"
                  onChange={(e) =>
                    change(position.id, { nickname: e.target.value })
                  }
                />
              </label>
              <label>
                Rugnummer · {position.label}
                <input
                  type="number"
                  min={1}
                  max={99}
                  required
                  value={p.shirt_number || ""}
                  onChange={(e) =>
                    change(position.id, {
                      shirt_number: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
          </fieldset>
        );
      })}
      {error && (
        <p role="alert" className="notice error">
          {error} Je wijzigingen blijven staan. Bij een versieconflict: sluit
          dit scherm en open het opnieuw.
        </p>
      )}
      <Button disabled={busy}>
        {busy ? "Opstelling opslaan…" : "Opstelling opslaan"}
      </Button>
      <p className="muted text-xs">
        Posities of bijnamen wijzigen geeft geen toegang tot privéregistraties.
      </p>
    </form>
  );
}
