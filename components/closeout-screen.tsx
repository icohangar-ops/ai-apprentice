import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Job, PhotoId, ScreenState } from "@/lib/types";

const PHOTO_LABEL: Record<PhotoId, string> = {
  plate: "Data plate",
  install: "Finished install",
  discharge: "T&P discharge",
};

export function CloseoutScreen({
  job,
  screen,
  interactive,
  shared,
  onAddPhoto,
  onNote,
  onNoteActivity,
  onOpenPdf,
  onInsertNote,
}: {
  job: Job;
  screen: ScreenState;
  interactive: boolean;
  shared?: boolean;
  onAddPhoto?: (id: PhotoId) => void;
  onNote?: (value: string) => void;
  onNoteActivity?: () => void;
  onOpenPdf?: () => void;
  onInsertNote?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-bezel text-screen shadow-2xl">
      <div className="flex items-center gap-3 px-4 py-2.5 text-xs text-white/70">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#c9a27a]" />
          <span className="size-2.5 rounded-full bg-[#d7c4a3]" />
          <span className="size-2.5 rounded-full bg-[#efe6d6]" />
        </span>
        <span className="truncate font-medium text-white/90">
          {shared ? "Shared screen · Alex's laptop" : "Closeout screen"} · fictional record
        </span>
        {shared ? (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[#ffb4a8]">
            <span className="size-1.5 rounded-full bg-[#ff5a4f]" />
            Watching
          </span>
        ) : null}
      </div>
      <div className="m-2 mt-0 rounded-xl bg-screen text-ink">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="font-serif text-lg leading-none">Northline Field Service</p>
            <p className="mt-1 text-xs text-muted">Closeout · {job.equipment}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm">{job.code}</p>
            <Badge variant={screen.held ? "stamp" : screen.saved ? "pine" : "outline"}>
              {screen.held ? "Left open" : screen.saved ? "Sent" : "In progress"}
            </Badge>
          </div>
        </header>
        <div className="grid gap-4 p-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="space-y-3 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-muted">Customer record</p>
            <p className="font-medium">{job.customer}</p>
            <p>
              {job.address}
              <br />
              {job.unit}
            </p>
            <p className="font-mono text-xs text-muted">{job.phone}</p>
            <p className="text-xs text-muted">Phone stays on this card. It does not belong in the note.</p>
            <p className="rounded-md border border-dashed border-line px-2 py-1.5 text-[11px] text-stamp">
              Fictional. Not a real customer.
            </p>
          </aside>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">Photos</p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PHOTO_LABEL) as PhotoId[]).map((id) => {
                  const taken = screen.photos[id];
                  return (
                    <div key={id} className="space-y-1.5">
                      <div className="aspect-[4/3] overflow-hidden rounded-md border border-line bg-white">
                        {taken ? (
                          <PhotoArt id={id} direction={job.discharge} gas={job.id === "teach"} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-muted">
                            Empty
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] leading-tight">{PHOTO_LABEL[id]}</p>
                      {id === "discharge" && taken ? (
                        <p className="text-[11px] leading-tight text-stamp">
                          {job.discharge === "uphill"
                            ? "Line climbs toward the joists."
                            : "Drops to about 4 inches off the floor."}
                        </p>
                      ) : null}
                      {interactive && !taken ? (
                        <Button size="sm" variant="outline" onClick={() => onAddPhoto?.(id)}>
                          Capture
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">Work note</p>
                {interactive && onInsertNote ? (
                  <button
                    type="button"
                    className="text-[11px] text-signal underline-offset-2 hover:underline"
                    onClick={onInsertNote}
                  >
                    Insert a sample note
                  </button>
                ) : null}
              </div>
              <Textarea
                value={screen.note}
                readOnly={!interactive}
                placeholder="What you did. No phone number."
                onChange={(event) => {
                  onNoteActivity?.();
                  onNote?.(event.target.value);
                }}
                onKeyDown={() => onNoteActivity?.()}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] text-muted">{job.filename}</p>
              {interactive ? (
                <Button size="sm" variant="outline" onClick={onOpenPdf}>
                  {screen.pdfOpen ? "PDF preview open" : "Preview branded PDF"}
                </Button>
              ) : screen.pdfOpen ? (
                <Badge variant="pine">PDF previewed</Badge>
              ) : (
                <Badge variant="outline">PDF not opened</Badge>
              )}
            </div>
            {screen.pdfOpen ? <PdfPreview job={job} note={screen.note} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfPreview({ job, note }: { job: Job; note: string }) {
  return (
    <article className="rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="font-serif text-xl leading-none">Northline</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Field closeout</p>
        </div>
        <p className="font-mono text-sm">{job.code}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted">Customer</dt>
          <dd>{job.customer}</dd>
        </div>
        <div>
          <dt className="text-muted">Site</dt>
          <dd>
            {job.address}, {job.unit}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">Equipment</dt>
          <dd>{job.equipment}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-relaxed">{note.trim() || "No note yet."}</p>
      <p className="mt-4 text-[11px] text-muted">
        Training document. Fictional job. Not a compliance record. File name {job.filename}.
      </p>
    </article>
  );
}

function PhotoArt({
  id,
  direction,
  gas,
}: {
  id: PhotoId;
  direction: "down" | "uphill";
  gas: boolean;
}) {
  if (id === "plate") {
    return (
      <svg viewBox="0 0 160 120" className="h-full w-full" role="img" aria-label="Data plate photo">
        <rect width="160" height="120" fill="#d9d3c6" />
        <rect x="28" y="28" width="104" height="64" rx="4" fill="#8d9294" stroke="#5c6163" />
        <text x="36" y="48" fill="#1c1916" fontSize="8" fontFamily="ui-monospace, monospace">
          {gas ? "MODEL GS-50" : "MODEL RH-40E"}
        </text>
        <text x="36" y="62" fill="#1c1916" fontSize="8" fontFamily="ui-monospace, monospace">
          {gas ? "SN GS-2218" : "SN 440218"}
        </text>
        <text x="36" y="76" fill="#1c1916" fontSize="8" fontFamily="ui-monospace, monospace">
          {gas ? "50 GAL GAS" : "40 GAL 240V"}
        </text>
      </svg>
    );
  }
  if (id === "install") {
    return (
      <svg viewBox="0 0 160 120" className="h-full w-full" role="img" aria-label="Finished install photo">
        <rect width="160" height="120" fill="#ece7dc" />
        <rect x="18" y="14" width="124" height="96" fill="#f7f4ee" stroke="#cfc6b6" />
        <rect x="58" y="36" width="44" height="62" rx="16" fill="#f4f7f8" stroke="#8aa0a6" />
        <rect x="70" y="28" width="20" height="12" fill="#c5ced1" />
        <path d="M78 28 C78 16, 108 16, 108 28" fill="none" stroke="#6d7c80" strokeWidth="3" />
        {gas ? <rect x="64" y="48" width="10" height="16" fill="#c45c26" /> : null}
      </svg>
    );
  }
  const uphill = direction === "uphill";
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" role="img" aria-label="Relief discharge photo">
      <rect width="160" height="120" fill="#ece7dc" />
      <rect x="36" y="18" width="36" height="84" rx="8" fill="#f4f7f8" stroke="#8aa0a6" />
      {uphill ? (
        <path d="M54 36 H92 V28 H128" fill="none" stroke="#8f2d2d" strokeWidth="4" />
      ) : (
        <path d="M54 36 H96 V102" fill="none" stroke="#234237" strokeWidth="4" />
      )}
      <line x1="20" y1="104" x2="146" y2="104" stroke="#b7ad9c" />
    </svg>
  );
}
