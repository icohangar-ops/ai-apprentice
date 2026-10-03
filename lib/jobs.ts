import type { Job, ScreenState } from "./types";

export const CAPTURE_JOB: Job = {
  id: "capture",
  code: "WO-1842",
  customer: "Maya Chen",
  address: "418 Harbor Lane",
  unit: "Apt 2B",
  equipment: "40-gal electric water heater",
  phone: "(555) 014-2286",
  filename: "Northline_WO-1842_418-Harbor.pdf",
  discharge: "down",
};

export const TEACH_JOB: Job = {
  id: "teach",
  code: "WO-2218",
  customer: "Jordan Hale",
  address: "90 Pike Street",
  unit: "Unit 4",
  equipment: "50-gal gas storage water heater",
  phone: "(555) 019-4428",
  filename: "Northline_WO-2218_90-Pike.pdf",
  discharge: "uphill",
};

export function emptyScreen(): ScreenState {
  return {
    photos: { plate: false, install: false, discharge: false },
    note: "",
    pdfOpen: false,
    saved: false,
    held: false,
  };
}

export const SAMPLE_NOTE =
  "Replaced the 40-gal electric with the unit on the data plate. T&P discharge drops to about 4 inches off the floor. No leaks at the unions. Customer walked the closet with me.";
