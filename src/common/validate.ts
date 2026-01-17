import { z } from "zod";
import { HttpError } from "./errors";

export function parseOrThrow<T>(schema: z.ZodType<T>, input: any): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new HttpError(400, "VALIDATION_ERROR", "Invalid request", r.error.flatten());
  return r.data;
}
