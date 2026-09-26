const DEFAULT_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

type FetchWithRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  retryStatuses?: ReadonlySet<number>;
};

const wait = (delayMs: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    clearTimeout(timeout);
    reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
  };
  const timeout = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, delayMs);

  if (signal?.aborted) {
    onAbort();
    return;
  }
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function fetchWithRetry(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  options: FetchWithRetryOptions = {},
) {
  const attempts = Math.max(1, options.attempts ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  let response: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(input, init);
      if (response.ok || !retryStatuses.has(response.status) || attempt === attempts) {
        return response;
      }
    } catch (error) {
      if ((error instanceof Error && error.name === 'AbortError') || attempt === attempts) {
        throw error;
      }
    }

    await wait(baseDelayMs * attempt, init?.signal);
  }

  return response as Response;
}
