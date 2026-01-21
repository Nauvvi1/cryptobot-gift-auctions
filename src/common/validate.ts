import { assert } from "./errors";

export function asNumber(v: unknown, name: string) {
  const n = typeof v === "string" ? Number(v) : (typeof v === "number" ? v : NaN);
  assert(Number.isFinite(n), "VALIDATION", `${name} must be a number`);
  return n;
}

export function asString(v: unknown, name: string, max = 200) {
  assert(typeof v === "string" && v.length > 0 && v.length <= max, "VALIDATION", `${name} must be a non-empty string (<=${max})`);
  return v;
}
