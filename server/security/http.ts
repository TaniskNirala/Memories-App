import type { Request, Response, NextFunction } from 'express';

const isProd = () => process.env.NODE_ENV === 'production';

function parseList(v?: string): string[] {
  return (v || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function allowedOrigins(): Set<string> {
  const set = new Set(parseList(process.env.ALLOWED_ORIGINS));
  if (process.env.APP_URL) {
    try {
      set.add(new URL(process.env.APP_URL).origin);
    } catch {}
  }
  return set;
}

/** Strict CORS: only same-origin or explicitly allow-listed origins get credentialed access. */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  res.vary('Origin');

  if (origin) {
    let allowed = false;
    try {
      const host = new URL(origin).host;
      allowed = host === req.headers.host || allowedOrigins().has(origin);
    } catch {
      allowed = false;
    }

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    } else if (req.method === 'OPTIONS') {
      return res.sendStatus(403);
    } else if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Cross-site state-changing request from an unknown origin: refuse outright
      return res.status(403).json({ error: 'Origin not allowed' });
    }
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

/** helmet-style security headers without adding a dependency. */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  const frameAncestors = parseList(process.env.FRAME_ANCESTORS);
  if (frameAncestors.length === 0) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }

  if (isProd()) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    // CSP is production-only: the Vite dev server injects inline scripts for HMR
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${["'self'", ...frameAncestors].join(' ')}`,
      ].join('; ')
    );
  }
  next();
}

/** Headers for user-uploaded content: it may never execute as a page. */
export function setUntrustedContentHeaders(res: Response) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

export function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
