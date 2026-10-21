"use client";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { formatDate } from "@/lib/domain";
import { socialError, type Social } from "./use-social";
const messages = {
  submission: "deelde een nieuw challengemoment",
  review: "beoordeelde je challenge",
  approved: "je challenge is goedgekeurd en je punten zijn toegekend",
  rejected: "je challenge is afgekeurd",
  comment: "reageerde op je challenge",
};
export function Notifications({
  social,
  close,
  openPost,
}: {
  social: Social;
  close: () => void;
  openPost: (id: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function read(ids: string[]) {
    setBusy(true);
    setError("");
    try {
      await social.markRead(ids);
    } catch (e) {
      setError(socialError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Meldingen" close={close}>
      <div className="stack">
        <p className="text-sm muted">
          Alleen challenges en reacties. Registraties en check-ins blijven
          buiten meldingen.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {social.notifications.some((n) => !n.read_at) && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void read(
                social.notifications.filter((n) => !n.read_at).map((n) => n.id),
              )
            }
          >
            <CheckCheck size={18} />
            Getoonde meldingen gelezen
          </Button>
        )}
        {social.notifications.map((n) => {
          const p = social.profiles.find((x) => x.id === n.actor_id);
          return (
            <button
              className={`notification-row ${n.read_at ? "" : "unread"}`}
              key={n.id}
              onClick={() => {
                void read([n.id]);
                close();
                openPost(n.submission_id);
              }}
            >
              <Avatar
                name={p?.display_name || "Crewlid"}
                path={p?.avatar_path}
              />
              <span>
                <strong>
                  {n.kind === "approved" || n.kind === "rejected"
                    ? "Crew Control"
                    : p?.display_name || "Crewlid"}
                </strong>
                <span>{messages[n.kind]}</span>
                <time>{formatDate(n.created_at)}</time>
              </span>
              {!n.read_at && <i aria-label="Ongelezen" />}
            </button>
          );
        })}
        {social.notifications.length >= social.notificationLimit && (
          <Button
            variant="secondary"
            disabled={social.loading}
            onClick={social.loadMoreNotifications}
          >
            Eerdere meldingen
          </Button>
        )}
        {!social.notifications.length && (
          <p className="empty">
            Je bent helemaal bij. Nieuwe momenten en beoordelingen verschijnen
            hier.
          </p>
        )}
      </div>
    </Dialog>
  );
}
