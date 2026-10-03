import { describe, expect, it } from "vitest";
import { citePermit, normalizeHit, speakPermit } from "./permits";

describe("permit citations", () => {
  it("cites address, type, and status from an Algolia hit", () => {
    const hit = normalizeHit({
      objectID: "ME-2218-04",
      address: "90 Pike Street, Unit 4",
      permitType: "Mechanical — gas water heater",
      status: "Expired",
      permitNumber: "ME-2218-04",
      fictional: true,
    });
    expect(hit).not.toBeNull();
    expect(citePermit(hit!)).toContain("90 Pike Street, Unit 4");
    expect(citePermit(hit!)).toContain("Mechanical — gas water heater");
    expect(citePermit(hit!)).toContain("Expired");
    expect(speakPermit(hit!)).toContain("fictional training record");
  });

  it("reads alternate Algolia field names", () => {
    const hit = normalizeHit({
      objectID: "PL-1",
      site_address: "12 Cedar Court",
      permit_type: "Electrical — panel",
      permit_status: "Finaled",
      permit_number: "EL-1104-02",
    });
    expect(hit?.address).toBe("12 Cedar Court");
    expect(hit?.status).toBe("Finaled");
    expect(hit?.fictional).toBe(false);
  });
});
