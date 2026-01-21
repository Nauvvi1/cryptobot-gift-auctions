import { nanoid } from "nanoid";

// useful for idempotency keys, request ids, etc.
export function rid(prefix = "r") {
  return `${prefix}_${nanoid(12)}`;
}
