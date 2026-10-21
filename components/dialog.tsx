"use client";
import { useEffect, useEffectEvent, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
export function Dialog({
  title,
  close,
  children,
  fullscreen = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  fullscreen?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onClose = useEffectEvent(close);
  useEffect(() => {
    const dialogId = crypto.randomUUID();
    history.pushState({ ...history.state, crewDialog: dialogId }, "");
    let popped = false;
    const back = () => {
      if (history.state?.crewDialog !== dialogId) {
        popped = true;
        onClose();
      }
    };
    window.addEventListener("popstate", back);
    const previous = document.activeElement as HTMLElement;
    const node = ref.current;
    node?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--keyboard-height",
        `${viewport?.height || window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener("resize", resize);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && node) {
        const elements = [
          ...node.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select,textarea,a[href],summary",
          ),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      viewport?.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--keyboard-height");
      window.removeEventListener("popstate", back);
      if (!popped && history.state?.crewDialog === dialogId) history.back();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="modal">
      <section
        ref={ref}
        tabIndex={-1}
        className={`dialog ${fullscreen ? "fullscreen-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <Button variant="ghost" aria-label="Sluiten" onClick={close}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
