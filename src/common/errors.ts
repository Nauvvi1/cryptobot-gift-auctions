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

function extractErrorDetails(e: any) {
  if (!e) return undefined;

  // Mongo errors often carry these fields
  const details: any = {
    name: e?.name,
    message: e?.message,
  };

  if (typeof e?.code !== "undefined") details.mongoCode = e.code;
  if (typeof e?.codeName !== "undefined") details.codeName = e.codeName;
  if (typeof e?.errorLabels !== "undefined") details.labels = e.errorLabels;
  if (typeof e?.keyPattern !== "undefined") details.keyPattern = e.keyPattern;
  if (typeof e?.keyValue !== "undefined") details.keyValue = e.keyValue;

  // Some libs attach nested causes
  if (e?.cause) {
    details.cause = {
      name: e.cause?.name,
      message: e.cause?.message,
      code: e.cause?.code,
    };
  }

  // Avoid returning huge objects
  return details;
}

export function asHttpError(e: any): HttpError {
  if (e instanceof HttpError) return e;

  return new HttpError(
    500,
    "INTERNAL",
    e?.message ?? "Internal error",
    extractErrorDetails(e)
  );
}
