export type PermitHit = {
  objectID: string;
  address: string;
  permitType: string;
  status: string;
  permitNumber: string;
  fictional: boolean;
};

export type PermitSearchResponse = {
  tool: "search_permits";
  source: "algolia" | "demo";
  index: "public_permits";
  query: string;
  hits: PermitHit[];
  citation: string | null;
  error: string | null;
};

const ADDRESS_KEYS = ["address", "site_address", "street"];
const TYPE_KEYS = ["permitType", "permit_type", "type"];
const STATUS_KEYS = ["status", "permit_status"];
const NUMBER_KEYS = ["permitNumber", "permit_number", "number"];

function stringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normalizeHit(record: Record<string, unknown>): PermitHit | null {
  const address = stringField(record, ADDRESS_KEYS);
  const permitType = stringField(record, TYPE_KEYS);
  const status = stringField(record, STATUS_KEYS);
  const permitNumber = stringField(record, NUMBER_KEYS);
  const objectID = stringField(record, ["objectID"]) || permitNumber;
  if (!address && !permitType && !status) return null;
  return {
    objectID: objectID || address,
    address: address || "Address not on the record",
    permitType: permitType || "Permit type not on the record",
    status: status || "Status not on the record",
    permitNumber: permitNumber || objectID || "No permit number",
    fictional: record.fictional === true,
  };
}

export function citePermit(hit: PermitHit): string {
  const base = `${hit.permitNumber} · ${hit.address} · ${hit.permitType} · ${hit.status}`;
  return hit.fictional ? `${base} · fictional training record` : base;
}

export function speakPermit(hit: PermitHit): string {
  const fiction = hit.fictional
    ? " This is a fictional training record, not a city filing."
    : "";
  return `The public permit index cites ${hit.permitNumber} at ${hit.address}. Permit type ${hit.permitType}. Status ${hit.status}.${fiction}`;
}
