export class HttpError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asHttpError(e: any): HttpError {
  if (e instanceof HttpError) return e;
  return new HttpError(500, "INTERNAL", e?.message ?? "Internal error");
}
