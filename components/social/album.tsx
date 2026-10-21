"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { PrivateMedia } from "./private-media";
import { FeedSkeleton, statusLabels } from "./feed";
import { formatDate } from "@/lib/domain";
import type { Social } from "./use-social";
export function MediaAlbum({
  social,
  openPost,
}: {
  social: Social;
  openPost: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const touch = useRef(0);
  const { festival = "", person = "", status = "" } = social.filters;
  const shown = social.posts;
  const index = shown.findIndex((s) => s.id === selected);
  const item = shown[index];
  function move(delta: number) {
    const next = shown[index + delta];
    if (next) setSelected(next.id);
  }
  return (
    <section className="stack">
      <header>
        <p className="eyebrow">HET WEEKEND, OPNIEUW BELEVEN</p>
        <h1>
          Wall of Shame<span className="text-lime-300">.</span>
        </h1>
        <p className="text-sm muted mt-3">
          Jullie gezamenlijke fotoalbum. Ook momenten die nog in review zijn.
        </p>
      </header>
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
        <label>
          Status
          <select
            value={status}
            onChange={(e) => social.setFilter("status", e.target.value)}
          >
            <option value="">Alle statussen</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {social.error && (
        <p className="notice error" role="alert">
          {social.error}
        </p>
      )}
      {social.loading && !shown.length && <FeedSkeleton />}
      <div className="album-grid">
        {shown.map((s) => (
          <article key={s.id} className="album-item">
            {s.mime_type.startsWith("image/") ? (
              <button
                className="album-media-open"
                aria-label={`Vergroot foto: ${s.title}`}
                onClick={() => setSelected(s.id)}
              >
                <PrivateMedia submission={s} compact />
              </button>
            ) : (
              <PrivateMedia submission={s} compact />
            )}
            <button
              className="album-open"
              aria-label={`Open media: ${s.title}`}
              onClick={() => setSelected(s.id)}
            >
              <h2>{s.title}</h2>
              <span>
                {social.profiles.find((p) => p.id === s.user_id)
                  ?.display_name || "Crewlid"}
              </span>
              <span>
                {statusLabels[s.status]} · {s.festival}
              </span>
            </button>
          </article>
        ))}
      </div>
      {!shown.length && !social.loading && !social.error && (
        <p className="card empty">Nog geen momenten voor dit filter.</p>
      )}
      {shown.length >= social.limit && (
        <Button
          variant="secondary"
          disabled={social.loading}
          onClick={social.loadMore}
        >
          Meer momenten laden
        </Button>
      )}
      {item && (
        <Dialog fullscreen title={item.title} close={() => setSelected("")}>
          <div
            className="media-viewer"
            onTouchStart={(e) => {
              touch.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if ((e.target as HTMLElement).closest("video")) return;
              const delta = e.changedTouches[0].clientX - touch.current;
              if (Math.abs(delta) > 60) move(delta < 0 ? 1 : -1);
            }}
          >
            <PrivateMedia submission={item} />
            <p className="text-sm muted">
              {social.profiles.find((p) => p.id === item.user_id)
                ?.display_name || "Crewlid"}{" "}
              · {formatDate(item.created_at)} · {statusLabels[item.status]}
            </p>
            <div className="viewer-actions">
              <Button
                variant="secondary"
                disabled={index <= 0}
                aria-label="Vorig moment"
                onClick={() => move(-1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {index + 1} / {shown.length}
              </span>
              <Button
                variant="secondary"
                disabled={index >= shown.length - 1}
                aria-label="Volgend moment"
                onClick={() => move(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button
              onClick={() => {
                setSelected("");
                openPost(item.id);
              }}
            >
              <ExternalLink size={18} />
              Open in Feed
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
