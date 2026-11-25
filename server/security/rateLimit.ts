import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  hits: number[];
}

/**
 * Small in-memory sliding-window rate limiter (no extra dependency).
 * State is per-process; it resets on restart, which is acceptable for a single-instance deploy.
 */
export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
}) {
  const buckets = new Map<string, Bucket>();
  const { windowMs, max } = opts;

  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, b] of buckets) {
      b.hits = b.hits.filter((t) => t > cutoff);
      if (b.hits.length === 0) buckets.delete(k);
    }
  }, Math.max(windowMs, 60_000));
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.keyFn ? opts.keyFn(req) : req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = buckets.get(key) || { hits: [] };
    bucket.hits = bucket.hits.filter((t) => t > cutoff);

    if (bucket.hits.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.hits[0] + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: opts.message || 'Too many requests. Please try again later.' });
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);
    next();
  };
}
