import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function redact(value: string): string {
  return value.replace(/sk_[a-zA-Z0-9]+/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 280);
}
