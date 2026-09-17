export type RadarCacheOptions = {
  maxEntries: number;
  maxConcurrent: number;
  negativeTtlMs: number;
};

export type RadarCacheSnapshot = {
  entries: number;
  negativeEntries: number;
  inFlight: number;
  queued: number;
  blockedUntil: number;
};

export class RadarFrameCache<T> {
  private readonly options: RadarCacheOptions;
  private readonly loader: (url: string, signal: AbortSignal) => Promise<T>;
  private cache = new Map<string, Promise<T>>();
  private negative = new Map<string, number>();
  private queue: Array<() => void> = [];
  private inFlight = 0;
  private blockedUntil = 0;

  constructor(options: RadarCacheOptions, loader: (url: string, signal: AbortSignal) => Promise<T>) {
    this.options = options;
    this.loader = loader;
  }

  get isBlocked() {
    return Date.now() < this.blockedUntil;
  }

  blockFor(milliseconds: number) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + Math.max(0, milliseconds));
  }

  snapshot(): RadarCacheSnapshot {
    return {
      entries: this.cache.size,
      negativeEntries: this.negative.size,
      inFlight: this.inFlight,
      queued: this.queue.length,
      blockedUntil: this.blockedUntil,
    };
  }

  pruneFramePaths(paths: string[]) {
    for (const key of this.cache.keys()) {
      if (!paths.some((path) => key.includes(path))) this.cache.delete(key);
    }
  }

  clear() {
    this.cache.clear();
    this.negative.clear();
  }

  async load(url: string, signal: AbortSignal): Promise<T | null> {
    if (signal.aborted || this.isBlocked) return null;
    const negativeUntil = this.negative.get(url);
    if (negativeUntil && Date.now() < negativeUntil) return null;
    if (negativeUntil) this.negative.delete(url);

    const cached = this.cache.get(url);
    if (cached) {
      this.touch(url, cached);
      try { return await cached; } catch { return null; }
    }

    const promise = this.run(url, signal);
    this.touch(url, promise);
    try {
      return await promise;
    } catch (error) {
      this.cache.delete(url);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.negative.set(url, Date.now() + this.options.negativeTtlMs);
      }
      return null;
    }
  }

  private async run(url: string, signal: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await this.loader(url, signal);
    } finally {
      this.release();
    }
  }

  private touch(url: string, promise: Promise<T>) {
    this.cache.delete(url);
    this.cache.set(url, promise);
    while (this.cache.size > this.options.maxEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }

  private acquire(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const enter = () => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        if (this.inFlight < this.options.maxConcurrent) {
          this.inFlight += 1;
          resolve();
        } else {
          this.queue.push(enter);
          signal.addEventListener('abort', abort, { once: true });
        }
      };
      const abort = () => {
        const index = this.queue.indexOf(enter);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      enter();
    });
  }

  private release() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.queue.shift()?.();
  }
}
