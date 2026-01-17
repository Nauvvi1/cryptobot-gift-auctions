export const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta ?? ""),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta ?? ""),
};
