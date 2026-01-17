import { HttpError } from "../../../common/errors";

export function assertNonNegative(label: string, v: number) {
  if (v < 0) throw new HttpError(500, "INVARIANT_BROKEN", `${label} < 0`, { v });
}
