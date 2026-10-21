"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  MessageCircle,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { PrivateMedia } from "./private-media";
import { socialError, type Comment, type Social } from "./use-social";
import { getSupabase } from "@/lib/supabase";
import { formatDate, type Submission } from "@/lib/domain";
export const statusLabels = {
  pending: "In review",
  approved: "Goedgekeurd",
  rejected: "Afgekeurd",
};
export function FeedSkeleton() {
  return (
    <div className="stack" role="status" aria-label="Feed laden">
      {[0, 1].map((i) => (
        <div className="card stack" key={i}>
          <div className="skeleton skeleton-line" />
          <div className="skeleton media-placeholder" />
          <div className="skeleton skeleton-line" />
        </div>
      ))}
    </div>
  );
}
export function Feed({
  social,
  uid,
  threshold,
  reviewOnly = false,
  openChallenge,
  onChanged,
}: {
  social: Social;
  uid: string;
  threshold: number;
  reviewOnly?: boolean;
  openChallenge: (id: string) => void;
  onChanged: () => void;
}) {
  const { festival = "", person = "", status = "" } = social.filters;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const shown = social.posts;
  async function vote(s: Submission, approve: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(s.id);
    setError("");
    setNotice("");
    try {
      const result = await getSupabase().rpc("review_submission", {
        sid: s.id,
        approve,
      });
      if (result.error) throw result.error;
      setNotice(approve ? "Stem opgeslagen." : "Inzending afgewezen.");
      await social.refresh();
      onChanged();
    } catch (e) {
      setError(socialError(e));
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <section
      className="social-feed stack"
      aria-label={reviewOnly ? "Challengebeoordelingen" : "Crewfeed"}
    >
      <header>
        <p className="eyebrow">DE VERHALEN VAN JULLIE WEEKEND</p>
        <div className="section-title">
          <h1>
            {reviewOnly ? "Beoordelen" : "Crewfeed"}
            <span className="text-lime-300">.</span>
          </h1>
          <span className="pill">
            {social.connected ? "Live" : "Verbinden"}
          </span>
        </div>
        <p className="muted text-sm">
          {threshold} unieke goedkeuringen voor de punten. Alleen jouw crew
          kijkt mee.
        </p>
      </header>
      {social.focusedId && (
        <Button variant="secondary" onClick={() => social.setFocusedId("")}>
          Alle momenten bekijken
        </Button>
      )}
      <div className="social-filters">
        <label>
          Festival
          <select
            value={festival}
            onChange={(e) => social.setFilter("festival", e.target.value)}
          >
            <option value="">Alles</option>
            <option>ADE</option>
            <option>DGTL</option>
            <option>KI/KI</option>
          </select>
        </label>
        <label>
          Deelnemer
          <select
            value={person}
            onChange={(e) => social.setFilter("person", e.target.value)}
          >
            <option value="">Iedereen</option>
            {social.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
        {!reviewOnly && (
          <label>
            Status
            <select
              value={status}
              onChange={(e) => social.setFilter("status", e.target.value)}
            >
              <option value="">Alle statussen</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {(error || social.error) && (
        <div className="notice error" role="alert">
          {error || social.error}
          <Button variant="ghost" onClick={() => void social.refresh()}>
            Opnieuw proberen
          </Button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {social.loading && !social.posts.length && <FeedSkeleton />}
      {!social.loading && !social.error && !shown.length && (
        <div className="card empty">
          {reviewOnly
            ? "Helemaal bij. Geen inzendingen om te beoordelen."
            : "Hier begint jullie weekendalbum. Dien een fotochallenge in om het eerste verhaal te delen."}
        </div>
      )}
      {shown.map((s) => {
        const profile = social.profiles.find((p) => p.id === s.user_id);
        const stats = social.stats.find((x) => x.submission_id === s.id);
        const voted = stats?.my_vote !== null && stats?.my_vote !== undefined;
        const own = s.user_id === uid;
        const canVote = s.status === "pending" && !own && !voted && !!stats;
        return (
          <article
            className="card submission-card stack"
            key={s.id}
            id={`submission-${s.id}`}
            data-submission-id={s.id}
          >
            <div className="post-author">
              <Avatar
                name={profile?.display_name || "Crewlid"}
                path={profile?.avatar_path}
              />
              <div>
                <strong>
                  {profile?.display_name || "Crewlid"}
                  {own && " (jij)"}
                </strong>
                <time dateTime={s.created_at}>{formatDate(s.created_at)}</time>
              </div>
              <span className={`submission-status ${s.status}`}>
                {statusLabels[s.status]}
              </span>
            </div>
            <div className="section-title !mb-0">
              <h2>{s.title}</h2>
              <span className="pill">
                {s.status === "approved" ? "+" : "Tot "}
                {s.points} PT
              </span>
            </div>
            <PrivateMedia submission={s} />
            <div className="post-tally">
              <span>{s.festival}</span>
              <strong>
                {stats?.approvals || 0}/{threshold} goedkeuringen
              </strong>
              {!!stats?.rejections && <span>{stats.rejections} afwijzing</span>}
            </div>
            {s.status === "pending" && (
              <div className="review-actions">
                <Button
                  disabled={!canVote || !!busy}
                  onClick={() => void vote(s, true)}
                >
                  <Check size={18} />
                  Goedkeuren
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canVote || !!busy}
                  onClick={() => void vote(s, false)}
                >
                  <X size={18} />
                  Afkeuren
                </Button>
              </div>
            )}
            {own && s.status === "pending" && (
              <p className="text-xs muted">
                Dit is jouw inzending. Andere crewleden beoordelen deze.
              </p>
            )}
            {voted && s.status === "pending" && (
              <p className="text-xs muted">
                Je stem is opgeslagen. Je kunt één keer stemmen.
              </p>
            )}
            <div className="post-footer">
              <button
                className="link text-sm"
                onClick={() => openChallenge(s.challenge_id)}
              >
                Bekijk challenge <ArrowUpRight size={15} />
              </button>
              <span className="text-sm muted">
                <MessageCircle size={16} />
                {stats?.comment_count || 0}
              </span>
            </div>
            <Comments submission={s} uid={uid} social={social} />
          </article>
        );
      })}
      {social.posts.length >= social.limit && (
        <Button
          variant="secondary"
          disabled={social.loading}
          onClick={social.loadMore}
        >
          {social.loading ? "Laden…" : "Meer momenten laden"}
        </Button>
      )}
      <p className="muted text-xs">
        Nieuwste activiteit eerst. Registraties en check-ins komen nooit in deze
        feed.
      </p>
    </section>
  );
}
function Comments({
  submission,
  uid,
  social,
}: {
  submission: Submission;
  uid: string;
  social: Social;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [limit, setLimit] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function load() {
      setLoading(true);
      const result = await getSupabase()
        .from("submission_comments")
        .select("*")
        .eq("submission_id", submission.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(0, limit - 1);
      if (!alive) return;
      if (result.error) {
        setRows([]);
        setError(socialError(result.error));
      } else {
        setRows(result.data || []);
      }
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [open, submission.id, social.revision, limit]);
  async function send() {
    if (lock.current || !text.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await getSupabase().rpc("post_submission_comment", {
        sid: submission.id,
        body_text: text,
        request_id: id,
      });
      if (result.error) throw result.error;
      setText("");
      setId(crypto.randomUUID());
      await social.refresh();
    } catch (e) {
      setError(socialError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function remove(row: Comment) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const before = rows;
    setRows((items) => items.filter((r) => r.id !== row.id));
    try {
      const result = await getSupabase().rpc("delete_submission_comment", {
        comment_id: row.id,
      });
      if (result.error) throw result.error;
      await social.refresh();
    } catch (e) {
      setRows(before);
      setError(socialError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="comments">
      <button
        className="comments-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MessageCircle size={17} />
        {open ? "Reacties verbergen" : "Reageren & reacties bekijken"}
      </button>
      {open && (
        <div className="stack">
          {loading && !rows.length && (
            <div
              className="skeleton skeleton-line"
              aria-label="Reacties laden"
            />
          )}
          {[...rows].reverse().map((row) => (
            <div className="comment" key={row.id}>
              <div>
                <strong>
                  {social.profiles.find((p) => p.id === row.user_id)
                    ?.display_name || "Crewlid"}
                </strong>
                <time>{formatDate(row.created_at)}</time>
                <p>{row.body}</p>
              </div>
              {row.user_id === uid && (
                <button
                  aria-label="Eigen reactie verwijderen"
                  disabled={busy}
                  onClick={() => void remove(row)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {rows.length >= limit && (
            <Button variant="ghost" onClick={() => setLimit((n) => n + 30)}>
              Eerdere reacties
            </Button>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor={`reply-${submission.id}`}>
              Jouw reactie
            </label>
            <textarea
              id={`reply-${submission.id}`}
              rows={2}
              maxLength={500}
              placeholder="Zeg iets tegen je crew…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
            <Button
              aria-label="Reactie plaatsen"
              disabled={busy || !text.trim()}
            >
              <Send size={19} />
            </Button>
          </form>
          <p className="muted text-xs">
            Maximaal 500 tekens · even pauze tussen reacties.
          </p>
        </div>
      )}
    </div>
  );
}
