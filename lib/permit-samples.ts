export const PERMIT_INDEX = "public_permits";

export const SAMPLE_PERMITS = [
  {
    objectID: "PL-1842-17",
    address: "418 Harbor Lane, Apt 2B",
    permitType: "Plumbing — water heater",
    status: "Issued",
    permitNumber: "PL-1842-17",
    city: "Harbor",
    fictional: true,
    note: "Fictional training record. Not a city filing.",
  },
  {
    objectID: "ME-2218-04",
    address: "90 Pike Street, Unit 4",
    permitType: "Mechanical — gas water heater",
    status: "Expired",
    permitNumber: "ME-2218-04",
    city: "Harbor",
    fictional: true,
    note: "Fictional training record. Not a city filing.",
  },
  {
    objectID: "EL-1104-02",
    address: "12 Cedar Court",
    permitType: "Electrical — panel",
    status: "Finaled",
    permitNumber: "EL-1104-02",
    city: "Harbor",
    fictional: true,
    note: "Fictional training record. Not a city filing.",
  },
  {
    objectID: "PL-0991-08",
    address: "77 Market Street",
    permitType: "Plumbing — water heater",
    status: "Withdrawn",
    permitNumber: "PL-0991-08",
    city: "Harbor",
    fictional: true,
    note: "Fictional training record. Not a city filing.",
  },
] as const;
