"use client";
import { useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { localInput, recordSchema, type RecordEntry } from "@/lib/domain";
import { recordLabels } from "@/lib/record-labels";
type Values = {
  substance: string;
  taken_at: string;
  quantity: string;
  notes: string;
};
export function QuickRecord({
  record,
  busy,
  close,
  save,
}: {
  record: RecordEntry | null;
  busy: boolean;
  close: () => void;
  save: (v: Values, id: string) => Promise<boolean>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(record ? 2 : 1);
  const [substance, setSubstance] = useState(record?.substance || "");
  const [other, setOther] = useState(false);
  const [time, setTime] = useState(() => localInput(record?.taken_at));
  const [quantity, setQuantity] = useState(record?.quantity || "");
  const [notes, setNotes] = useState(record?.notes || "");
  const [error, setError] = useState("");
  const lock = useRef(false);
  function choose(label: string) {
    setSubstance(label);
    setTime(localInput());
    setStep(2);
    setError("");
  }
  return (
    <Dialog
      title={record ? "Registratie bewerken" : "Nieuwe registratie"}
      close={close}
    >
      <div className="step-label">
        {record
          ? "Jouw historie aanpassen"
          : `STAP ${step} VAN 2 · ${step === 1 ? "KIES JE LABEL" : "BEVESTIG"}`}
      </div>
      {step === 1 ? (
        <div className="stack">
          <p className="muted text-sm">Wat wil je vastleggen?</p>
          <div className="substance-grid">
            {recordLabels.map((label, i) => (
              <button
                key={label}
                className="substance-tile"
                onClick={() => choose(label)}
              >
                <span className="tile-number">0{i + 1}</span>
                <strong>{label}</strong>
                <span className="tile-plus">+</span>
              </button>
            ))}
            <button className="substance-tile" onClick={() => setOther(true)}>
              <span className="tile-number">06</span>
              <strong>Anders</strong>
              <span className="tile-plus">+</span>
            </button>
          </div>
          {other && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (substance.trim()) choose(substance.trim());
              }}
            >
              <label>
                Eigen label
                <input
                  autoFocus
                  maxLength={60}
                  value={substance}
                  onChange={(e) => setSubstance(e.target.value)}
                  required
                />
              </label>
              <Button>Verder</Button>
            </form>
          )}
          <p className="text-xs muted leading-5">
            Labels zijn jouw eigen omschrijving. Ze worden niet samengevoegd of
            geïnterpreteerd.
          </p>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current || busy) return;
            lock.current = true;
            setError("");
            try {
              const values = recordSchema.parse({
                substance,
                taken_at: new Date(time).toISOString(),
                quantity,
                notes,
              });
              if (!(await save(values, id)))
                setError(
                  "Opslaan mislukt. Je invoer is behouden. Controleer je verbinding en probeer opnieuw.",
                );
            } catch {
              setError(
                "Controleer het label en kies een geldig tijdstip in het verleden.",
              );
            } finally {
              lock.current = false;
            }
          }}
        >
          {record ? (
            <label>
              Middel
              <input
                value={substance}
                maxLength={60}
                onChange={(e) => setSubstance(e.target.value)}
                required
              />
            </label>
          ) : (
            <div className="selected-substance">
              <span className="eyebrow">JOUW REGISTRATIE</span>
              <h3>{substance}</h3>
              <button
                type="button"
                className="text-sm link"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="inline" size={14} /> Ander label kiezen
              </button>
            </div>
          )}
          <label>
            Tijdstip (tijdzone van je apparaat)
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </label>
          <details open={record ? true : undefined} className="record-details">
            <summary>
              Omschrijving of hoeveelheid{" "}
              <span className="muted">optioneel</span> <ChevronDown size={16} />
            </summary>
            <div className="stack pt-4">
              <label>
                Hoeveelheid (optioneel)
                <input
                  maxLength={60}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Jouw eigen omschrijving"
                />
              </label>
              <label>
                Opmerking (optioneel)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </details>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            <Check size={18} />
            {busy ? "Opslaan…" : "Registratie opslaan"}
          </Button>
          <p className="text-xs muted leading-5">
            Dit legt alleen een historisch moment vast. Het is geen advies over
            veilig gebruik. Je deelkeuze bepaalt wie het ziet.
          </p>
        </form>
      )}
    </Dialog>
  );
}
