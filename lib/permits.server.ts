import { SAMPLE_PERMITS, PERMIT_INDEX } from "./permit-samples";
import { citePermit, normalizeHit, speakPermit, type PermitHit, type PermitSearchResponse } from "./permits";

function appId(): string {
  return process.env.ALGOLIA_APP_ID?.trim() ?? "";
}

function searchKey(): string {
  return process.env.ALGOLIA_SEARCH_KEY?.trim() ?? "";
}

function writeKey(): string {
  return process.env.ALGOLIA_WRITE_KEY?.trim() ?? "";
}

export function algoliaConfigured(): boolean {
  return Boolean(appId() && searchKey());
}

function redactSecrets(value: string): string {
  let text = value.replace(/sk_[a-zA-Z0-9]+/g, "[redacted]");
  for (const secret of [appId(), searchKey(), writeKey()]) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 280);
}

function host(kind: "read" | "write"): string {
  const id = appId();
  return kind === "read" ? `https://${id}-dsn.algolia.net` : `https://${id}.algolia.net`;
}

async function algolia(
  kind: "read" | "write",
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  const key = kind === "write" ? writeKey() : searchKey();
  if (!appId() || !key) {
    throw new Error("Algolia is not configured");
  }
  const headers = new Headers(init?.headers);
  headers.set("X-Algolia-Application-Id", appId());
  headers.set("X-Algolia-API-Key", key);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const primary = await fetch(`${host(kind)}${pathname}`, { ...init, headers });
  if (primary.status !== 404 && primary.status !== 0) return primary;
  if (kind === "read") {
    return fetch(`https://${appId()}.algolia.net${pathname}`, { ...init, headers });
  }
  return primary;
}

async function waitForTask(taskID: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await algolia("write", `/1/indexes/${PERMIT_INDEX}/task/${taskID}`);
    if (!response.ok) return;
    const body = (await response.json()) as { status?: string };
    if (body.status === "published") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function seedIndex(): Promise<void> {
  if (!writeKey()) {
    throw new Error("Algolia write key is not configured");
  }
  const response = await algolia("write", `/1/indexes/${PERMIT_INDEX}/batch`, {
    method: "POST",
    body: JSON.stringify({
      requests: SAMPLE_PERMITS.map((permit) => ({
        action: "updateObject",
        body: permit,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(redactSecrets(await response.text()));
  }
  const body = (await response.json()) as { taskID?: number };
  if (typeof body.taskID === "number") await waitForTask(body.taskID);
  const settings = await algolia("write", `/1/indexes/${PERMIT_INDEX}/settings`, {
    method: "PUT",
    body: JSON.stringify({
      searchableAttributes: ["address", "permitType", "status", "permitNumber", "city"],
    }),
  });
  if (!settings.ok) return;
}

let seeding: Promise<void> | null = null;

export async function ensurePermitIndex(): Promise<void> {
  if (!algoliaConfigured()) {
    throw new Error("Algolia is not configured");
  }
  if (!seeding) {
    seeding = seedIndex().catch((error) => {
      seeding = null;
      throw error;
    });
  }
  return seeding;
}

function localHits(query: string): PermitHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SAMPLE_PERMITS.map((permit) => normalizeHit({ ...permit })).filter((hit): hit is PermitHit => {
    if (!hit) return false;
    const haystack = `${hit.address} ${hit.permitType} ${hit.status} ${hit.permitNumber}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export async function searchPermits(query: string): Promise<PermitSearchResponse> {
  const cleaned = query.trim().slice(0, 200);
  if (!cleaned) {
    return {
      tool: "search_permits",
      source: algoliaConfigured() ? "algolia" : "demo",
      index: PERMIT_INDEX,
      query: "",
      hits: [],
      citation: null,
      error: "Enter an address, permit type, or status.",
    };
  }
  if (!algoliaConfigured()) {
    const hits = localHits(cleaned);
    const top = hits[0] ?? null;
    return {
      tool: "search_permits",
      source: "demo",
      index: PERMIT_INDEX,
      query: cleaned,
      hits,
      citation: top ? citePermit(top) : null,
      error: hits.length === 0 ? "No permit matched that search. Demo index, not a city filing." : null,
    };
  }
  try {
    await ensurePermitIndex();
    const response = await algolia("read", `/1/indexes/${PERMIT_INDEX}/query`, {
      method: "POST",
      body: JSON.stringify({ query: cleaned, hitsPerPage: 5 }),
    });
    if (!response.ok) {
      return {
        tool: "search_permits",
        source: "algolia",
        index: PERMIT_INDEX,
        query: cleaned,
        hits: [],
        citation: null,
        error: redactSecrets(await response.text()) || "Permit search failed.",
      };
    }
    const body = (await response.json()) as { hits?: Record<string, unknown>[] };
    const hits = (body.hits ?? [])
      .map((hit) => normalizeHit(hit))
      .filter((hit): hit is PermitHit => hit !== null);
    const top = hits[0] ?? null;
    return {
      tool: "search_permits",
      source: "algolia",
      index: PERMIT_INDEX,
      query: cleaned,
      hits,
      citation: top ? citePermit(top) : null,
      error: hits.length === 0 ? "No permit matched that search." : null,
    };
  } catch (error) {
    return {
      tool: "search_permits",
      source: "algolia",
      index: PERMIT_INDEX,
      query: cleaned,
      hits: [],
      citation: null,
      error: redactSecrets(error instanceof Error ? error.message : "Permit search failed."),
    };
  }
}

export function spokenCitation(hit: PermitHit): string {
  return speakPermit(hit);
}
