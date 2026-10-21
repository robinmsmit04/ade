"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { formatDate } from "@/lib/domain";
import type { MatchReport } from "@/lib/selection";
import { socialError } from "@/components/social/use-social";
export function LockerRoom({
  cid,
  canManage,
  reports,
  limit,
  loadMore,
  refresh,
}: {
  cid: string;
  canManage: boolean;
  reports: MatchReport[];
  limit: number;
  loadMore: () => void;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    body: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState("");
  const lock = useRef(false);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !editing) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await getSupabase().rpc("save_match_report", {
        cid,
        heading: editing.title,
        report_body: editing.body,
        request_id: editing.id,
      });
      if (r.error) throw r.error;
      setEditing(undefined);
      await refresh();
      setNotice("Het officiële verslag staat in de kleedkamer.");
    } catch (e) {
      setError(socialError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="stack locker-room">
      <header>
        <span className="eyebrow">ALLEEN VOOR DE SELECTIE</span>
        <h3>Praatjes na de wedstrijd.</h3>
        <p className="muted text-sm">
          De officiële nabeschouwing van bondscoach Lucas. Scherp op de tactiek,
          mild voor de spelers.
        </p>
      </header>
      {canManage && !editing && (
        <Button
          onClick={() => {
            setEditing({ id: crypto.randomUUID(), title: "", body: "" });
            setNotice("");
            setError("");
          }}
        >
          Wedstrijdverslag schrijven
        </Button>
      )}
      {editing && canManage && (
        <form className="stack card" onSubmit={publish}>
          <p className="eyebrow">NAMENS BONDSCOACH LUCAS</p>
          <label>
            Titel wedstrijdverslag
            <input
              minLength={3}
              maxLength={120}
              required
              disabled={busy}
              value={editing.title}
              onChange={(e) =>
                setEditing({ ...editing, title: e.target.value })
              }
              placeholder="ADE-uit: tactisch een wereldprestatie"
            />
          </label>
          <label>
            Wedstrijdverslag
            <textarea
              minLength={10}
              maxLength={8000}
              required
              rows={8}
              disabled={busy}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="De selectie verscheen goedgemutst aan de aftrap…"
            />
          </label>
          <p className="muted text-xs">
            Zichtbaar voor alle huidige en toekomstige teamleden. Zet hier geen
            privéregistraties of informatie over anderen zonder hun toestemming.
          </p>
          <Button disabled={busy}>
            {busy ? "Publiceren…" : "Verslag publiceren"}
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => setEditing(undefined)}
          >
            Annuleren
          </Button>
        </form>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error} Je tekst blijft staan.
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!reports.length && !editing && (
        <div className="locker-empty">
          <span aria-hidden="true">⚽</span>
          <h3>De persconferentie begint zo.</h3>
          <p>
            Het eerste officiële wedstrijdverslag verschijnt hier zodra het
            gepubliceerd is.
          </p>
        </div>
      )}
      {reports.map((report) => (
        <article key={report.id} className="match-report card stack">
          <div className="report-byline">
            <span className="eyebrow">OFFICIEEL WEDSTRIJDVERSLAG</span>
            <time dateTime={report.created_at}>
              {formatDate(report.created_at)}
            </time>
          </div>
          <h3>{report.title}</h3>
          <p className="report-body">{report.body}</p>
          <p className="muted text-xs">
            Bondscoach Lucas · ADE Selectie
            {report.updated_at !== report.created_at
              ? ` · bijgewerkt ${formatDate(report.updated_at)}`
              : ""}
          </p>
          {canManage && (
            <div className="report-actions">
              <Button
                variant="ghost"
                disabled={busy || !!editing}
                onClick={() => {
                  setEditing({
                    id: report.id,
                    title: report.title,
                    body: report.body,
                  });
                  setError("");
                  setNotice("");
                }}
              >
                Verslag bewerken
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRemoving(report.id)}
              >
                Verslag verwijderen
              </Button>
            </div>
          )}
          {canManage && removing === report.id && (
            <div className="notice stack">
              <p>Dit verslag definitief uit de kleedkamer verwijderen?</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    const r = await getSupabase().rpc("delete_match_report", {
                      report_id: report.id,
                    });
                    if (r.error) throw r.error;
                    setRemoving("");
                    await refresh();
                  } catch (e) {
                    setError(socialError(e));
                  } finally {
                    lock.current = false;
                    setBusy(false);
                  }
                }}
              >
                Definitief verwijderen
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRemoving("")}
              >
                Behouden
              </Button>
            </div>
          )}
        </article>
      ))}
      {reports.length >= limit && (
        <Button variant="secondary" onClick={loadMore}>
          Eerdere wedstrijdverslagen
        </Button>
      )}
    </div>
  );
}
