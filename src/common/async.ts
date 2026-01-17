export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs: number }
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= opts.retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === opts.retries) break;
      await sleep(opts.baseMs * (i + 1));
    }
  }
  throw lastErr;
}
