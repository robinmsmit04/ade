"use client";
import { useState } from "react";
import { ClipboardList, DoorOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/dialog";
import { getSupabase } from "@/lib/supabase";
import { socialError } from "@/components/social/use-social";
import type { Profile, Member } from "@/lib/domain";
import { emptyLineup, type LineupPlayer } from "@/lib/selection";
import { useSelection } from "./use-selection";
import { LineupField } from "./lineup-field";
import { LineupEditor } from "./lineup-editor";
import { PlayerProfile } from "./player-profile";
import { LockerRoom } from "./locker-room";
export function SelectionHome({
  cid,
  uid,
  profiles,
  members,
}: {
  cid: string;
  uid: string;
  profiles: Profile[];
  members: Member[];
}) {
  const selection = useSelection(cid, uid);
  const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState<{
    players: LineupPlayer[];
    version: number;
  }>();
  const [locker, setLocker] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const data = selection.data;
  const canManage = !!uid && data?.settings.manager_id === uid;
  const canClaim =
    !!uid &&
    !!data &&
    !data.settings.manager_id &&
    members.some((m) => m.user_id === uid && m.role === "admin");
  const teamProfiles = profiles.filter((p) =>
    members.some((m) => m.user_id === p.id),
  );
  const player = data?.players.find(
    (p) => p.user_id === selected && !!selected,
  );
  return (
    <section className="selection-home" aria-label="ADE Selectie">
      <header className="selection-heading">
        <div>
          <span className="eyebrow">DE OFFICIËLE OPSTELLING</span>
          <h2>
            ADE Selectie<span>.</span>
          </h2>
        </div>
        <span className="selection-crest" aria-hidden="true">
          ADE<small>SELECTIE</small>
        </span>
      </header>
      <p className="selection-tagline">
        Zeven spelers. Nul middenvelders. Vol vertrouwen.
      </p>
      {selection.error && (
        <div className="notice error" role="alert">
          <p>{selection.error}</p>
          <Button variant="ghost" onClick={() => void selection.refresh()}>
            Selectie opnieuw laden
          </Button>
        </div>
      )}
      {cid && !data && !selection.error && (
        <p role="status" className="muted text-sm">
          De selectie loopt het veld op…
        </p>
      )}
      <LineupField
        players={data?.players || emptyLineup()}
        profiles={teamProfiles}
        open={(p) => setSelected(p.user_id!)}
      />
      <div className="selection-coach">
        <ClipboardList size={20} aria-hidden="true" />
        <span>
          <strong>Bondscoach Lucas</strong>
          <small>Het tactische brein achter de avond.</small>
        </span>
      </div>
      <div className="selection-actions">
        <Button
          variant="secondary"
          disabled={!data}
          onClick={() => setLocker(true)}
        >
          <DoorOpen size={18} />
          Kleedkamer
          {data?.reports.length ? (
            <span className="report-count">{data.reports.length}</span>
          ) : null}
        </Button>
        {canManage && (
          <Button
            variant="ghost"
            onClick={() =>
              setEditor({
                players: data!.players,
                version: data!.settings.version,
              })
            }
          >
            <ClipboardList size={18} />
            Opstelling beheren
          </Button>
        )}
      </div>
      {data && !canManage && !canClaim && (
        <p className="notice selection-manager-status" role="status">
          {data.settings.manager_id
            ? `Opstellingsbeheer: ${teamProfiles.find((p) => p.id === data.settings.manager_id)?.display_name || "het aangewezen account"}. Alleen dat account ziet de beheerknop.`
            : "Opstellingsbeheer is nog niet toegewezen. De projecteigenaar moet het eigen account eenmalig aanwijzen; daarna verschijnt hier de beheerknop."}
        </p>
      )}
      {canClaim && (
        <div className="notice stack">
          <p className="text-sm">
            Activeer als beheerder jouw exclusieve opstellingsbeheer. Alleen
            jouw account kan daarna posities toekennen en namens Lucas verslagen
            plaatsen.
          </p>
          <Button
            variant="secondary"
            disabled={claiming}
            onClick={async () => {
              if (claiming) return;
              setClaiming(true);
              setError("");
              try {
                const r = await getSupabase().rpc("set_selection_manager", {
                  cid,
                  manager_user_id: uid,
                });
                if (r.error) throw r.error;
                await selection.refresh();
              } catch (e) {
                setError(socialError(e));
              } finally {
                setClaiming(false);
              }
            }}
          >
            <ShieldCheck size={18} />
            {claiming ? "Activeren…" : "Opstellingsbeheer activeren"}
          </Button>
        </div>
      )}
      {canManage && (
        <p className="selection-manager-note">
          <ShieldCheck size={12} />
          Jij beheert de selectie. Spelers kiezen hun eigen profielfoto.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {selected && data && (
        <Dialog title="Spelersprofiel" close={() => setSelected(undefined)}>
          {player ? (
            <PlayerProfile
              cid={cid}
              uid={uid}
              player={player}
              profile={teamProfiles.find((p) => p.id === selected)}
              revision={selection.revision}
            />
          ) : (
            <p>Deze speler staat niet meer in de opstelling.</p>
          )}
        </Dialog>
      )}
      {editor && data && (
        <Dialog title="Opstelling beheren" close={() => setEditor(undefined)}>
          {canManage ? (
            <LineupEditor
              cid={cid}
              players={editor.players}
              version={editor.version}
              profiles={teamProfiles}
              saved={async () => {
                await selection.refresh();
                setEditor(undefined);
              }}
            />
          ) : (
            <p role="alert">Je hebt geen opstellingsbeheer meer.</p>
          )}
        </Dialog>
      )}
      {locker && data && (
        <Dialog title="De kleedkamer" close={() => setLocker(false)}>
          <LockerRoom
            cid={cid}
            canManage={canManage}
            reports={data.reports}
            limit={selection.limit}
            loadMore={selection.loadMore}
            refresh={selection.refresh}
          />
        </Dialog>
      )}
    </section>
  );
}
