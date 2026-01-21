export class AppError extends Error {
  public statusCode: number;
  public code: string;
  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function assert(condition: unknown, code: string, message: string, statusCode = 400): asserts condition {
  if (!condition) throw new AppError(code, message, statusCode);
}
