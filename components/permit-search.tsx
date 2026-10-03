"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoice, type PermitHit } from "@/components/voice-provider";
import { citePermit, speakPermit } from "@/lib/permits";

export function PermitSearch({
  initialQuery,
  caller,
}: {
  initialQuery: string;
  caller: "debrief" | "tutor";
}) {
  const voice = useVoice();
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<PermitHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cited, setCited] = useState<string | null>(null);
  const [source, setSource] = useState<string>("algolia");

  async function run(nextQuery = query) {
    setBusy(true);
    const result = await voice.searchPermits(nextQuery, caller);
    setHits(result.hits);
    setError(result.error);
    setCited(result.citation);
    setSource(result.source);
    setBusy(false);
  }

  useEffect(() => {
    void run(initialQuery);
    // Search the prefilled address once when this stage opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
      <div>
        <p className="text-sm font-medium">Public permits</p>
        <p className="text-xs text-muted">
          {source === "demo"
            ? "Demo permit index. These records are fictional training data, not city filings."
            : "Algolia index public_permits. Sample records are fictional training data, not city filings."}
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <Input
          value={query}
          aria-label="Permit search"
          placeholder="Address, permit type, or status"
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Searching…" : "Search permits"}
        </Button>
      </form>
      {error ? <p className="text-xs text-stamp">{error}</p> : null}
      <ul className="space-y-2">
        {hits.map((hit) => (
          <li key={hit.objectID} className="rounded-md border border-line bg-card px-3 py-2 text-sm">
            <p className="font-mono text-xs">{hit.permitNumber}</p>
            <p>{hit.address}</p>
            <p>{hit.permitType}</p>
            <p>Status: {hit.status}</p>
            {hit.fictional ? <p className="text-xs text-muted">Fictional training record</p> : null}
            <Button
              size="sm"
              variant="signal"
              className="mt-2"
              onClick={() => {
                setCited(citePermit(hit));
                voice.cue(speakPermit(hit));
              }}
            >
              Cite this hit
            </Button>
          </li>
        ))}
      </ul>
      {cited ? <p className="text-xs text-pine">Cited: {cited}</p> : null}
    </div>
  );
}
