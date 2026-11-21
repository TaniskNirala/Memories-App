import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb, queryOne } from './server/db.ts';
import { flushNeonWrites, closeNeon } from './server/neon.ts';
import { seedDatabase } from './server/seed.ts';
import { authMiddleware } from './server/middleware/auth.ts';
import { LocalDiskStorageAdapter } from './server/storage/local.ts';
import { getStorageAdapter, isTelegramKey } from './server/storage/index.ts';
import { repairPostFileKeys } from './server/storage/sync.ts';
import { startTelegramDeletionWatcher, stopTelegramDeletionWatcher } from './server/storage/tg-deletion-sync.ts';
import { isDeleteProtected } from './server/config.ts';
import { corsMiddleware, securityHeaders, setUntrustedContentHeaders } from './server/security/http.ts';
import { MIME_BY_EXT, isAllowedMediaName } from './server/security/media.ts';
import { canAccessStorageKey, canAccessTelegramMessage, normaliseKey } from './server/security/mediaAccess.ts';

// Routers
import { authRouter } from './server/routes/auth.ts';
import { groupsRouter } from './server/routes/groups.ts';
import { postsRouter } from './server/routes/posts.ts';
import { albumsRouter } from './server/routes/albums.ts';
import { placementsRouter } from './server/routes/placements.ts';
import { commentsRouter } from './server/routes/comments.ts';
import { reactionsRouter } from './server/routes/reactions.ts';
import { feedRouter } from './server/routes/feed.ts';
import { adminRouter, reportsRouter } from './server/routes/admin.ts';
import { notificationsRouter } from './server/routes/notifications.ts';
import { aiRouter } from './server/routes/ai.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  await getDb();
  await repairPostFileKeys().catch((e) => console.warn('Storage key repair notice:', e));

  const app = express();

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  } else if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // typical single reverse proxy (Render, Fly, Railway, ...)
  }

  // Security headers + strict CORS (same-origin or ALLOWED_ORIGINS / APP_URL only)
  app.use(securityHeaders);
  app.use(corsMiddleware);

  app.use(cookieParser());

  // Durability guarantee: for every write request (POST/PUT/PATCH/DELETE) the response is only
  // sent after all queued database writes have been committed to Neon. When the browser sees
  // "success", the data is already permanently stored.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const originalEnd = res.end.bind(res) as (...args: any[]) => any;
    (res as any).end = (...args: any[]) => {
      flushNeonWrites()
        .catch(() => {})
        .finally(() => originalEnd(...args));
      return res;
    };
    next();
  });
  // Session & user parser runs BEFORE body parsing so large bodies are only accepted from signed-in users
  app.use(authMiddleware as any);

  // Image-bearing AI requests (base64 payloads) are allowed to be larger, but only for signed-in users
  app.use('/api/ai', (req, res, next) => {
    if ((req as any).user) return express.json({ limit: '25mb' })(req, res, next);
    next();
  });
  // Everything else: small JSON/form bodies only (file uploads use multipart/raw routes)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // --- Local Disk Storage Direct Adapter Endpoints ---
  const localStorageAdapter = new LocalDiskStorageAdapter();

  // Media access guard. A request may proceed when either:
  //  - it carries a valid session AND that user is allowed to see this specific file
  //    (owner, admin, or a viewer of a post that contains it), or
  //  - it carries an unexpired HMAC view token that was issued by the server for this exact key.
  const requireMediaAccess = (opts: { key?: (req: express.Request) => string | undefined; msgId?: (req: express.Request) => string | undefined }) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const u = (req as any).user as { id: string; role: string; status: string } | undefined;
      const key = opts.key?.(req);
      const msgId = opts.msgId?.(req);

      if (u && u.status !== 'suspended') {
        const ok = msgId ? canAccessTelegramMessage(u, msgId) : key ? canAccessStorageKey(u, key) : false;
        if (ok) return next();
        if (u.role === 'pending') {
          return res.status(401).json({ error: 'Authentication required' });
        }
        return res.status(403).json({ error: 'You do not have access to this file' });
      }

      const { token, expires } = req.query as { token?: string; expires?: string };
      if (key && token && expires) {
        const exp = parseInt(String(expires), 10);
        if (!Number.isNaN(exp) && localStorageAdapter.verifyToken(key, exp, 'view', String(token))) {
          return next();
        }
      }
      return res.status(401).json({ error: 'Authentication required' });
    };

  // Browser direct upload endpoint (verifies HMAC signature)
  app.put('/api/storage/upload', express.raw({ type: '*/*', limit: '500mb' }), async (req, res) => {
    try {
      const { key, token, expires } = req.query as { key?: string; token?: string; expires?: string };
      if (!key || !token || !expires) {
        return res.status(400).json({ error: 'Missing key, token, or expires parameter' });
      }

      const expNumber = parseInt(expires, 10);
      const isValid = localStorageAdapter.verifyToken(key, expNumber, 'upload', token);
      if (!isValid) {
        return res.status(403).json({ error: 'Invalid or expired upload authorization token' });
      }
      if (!isAllowedMediaName(key)) {
        return res.status(415).json({ error: 'File type not allowed' });
      }

      const targetPath = localStorageAdapter.getFilePathForWrite(key);

      // Handle buffer, string, or stream piping into target file
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        fs.writeFileSync(targetPath, req.body);
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        fs.writeFileSync(targetPath, Buffer.from(req.body));
      } else {
        await new Promise<void>((resolve, reject) => {
          const writeStream = fs.createWriteStream(targetPath);
          req.pipe(writeStream);
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          req.on('error', reject);
        });
      }

      res.json({ success: true, key });
    } catch (err: any) {
      console.error('Storage upload error:', err);
      res.status(500).json({ error: 'Upload write failed' });
    }
  });

  // Uploads directory: per-file authorization, media extensions only, never rendered as a page
  const decodeUploadKey = (req: express.Request) => {
    try {
      return decodeURIComponent(req.path).replace(/^[/\\]+/, '');
    } catch {
      return '';
    }
  };
  app.use(
    '/uploads',
    (req, res, next) => {
      if (!isAllowedMediaName(decodeUploadKey(req))) return res.status(404).end();
      next();
    },
    requireMediaAccess({ key: decodeUploadKey }),
    express.static(path.resolve(process.cwd(), 'uploads'), {
      dotfiles: 'deny',
      index: false,
      redirect: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'private, max-age=3600');
        setUntrustedContentHeaders(res);
        res.setHeader('Content-Disposition', 'inline');
      },
    })
  );

  // NotaForge-style direct Telegram MTProto media streaming endpoint (clean filename path for HTML5 <video> seeking)
  const handleDirectTelegramFile = async (req: express.Request, res: express.Response) => {
    try {
      const msgId = parseInt(String(req.params.msgId || ''), 10);
      if (!msgId || Number.isNaN(msgId) || msgId <= 0) {
        return res.status(400).json({ error: 'Invalid Telegram message ID' });
      }
      const rawName = String(req.params.fileName || req.query.name || `media_${msgId}.bin`);
      const storageKey = `tgmsg:${msgId}/${rawName}`;

      setUntrustedContentHeaders(res);

      const storage = getStorageAdapter();
      if (storage.streamToResponse) {
        const handled = await storage.streamToResponse(storageKey, req, res);
        if (handled) return;
      }
      if (!res.headersSent) {
        res.status(404).json({ error: 'Telegram media not found' });
      }
    } catch (err: any) {
      console.error('Direct Telegram media stream error:', err?.message || err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to stream media' });
      }
    }
  };
  app.get('/api/storage/file/:msgId/:fileName', requireMediaAccess({ msgId: (req) => req.params.msgId }), handleDirectTelegramFile);
  app.get('/api/storage/file/:msgId', requireMediaAccess({ msgId: (req) => req.params.msgId }), handleDirectTelegramFile);

  // Universal media view endpoint (streams from Telegram, local disk, or cloud S3/Backblaze B2)
  app.get('/api/storage/view', requireMediaAccess({ key: (req) => (typeof req.query.key === 'string' ? req.query.key : undefined) }), async (req, res) => {
    try {
      const rawKey = req.query.key as string;
      if (!rawKey) {
        return res.status(400).json({ error: 'Missing key parameter' });
      }

      // Uploaded content is never allowed to run as a page
      setUntrustedContentHeaders(res);

      // Normalize key (resolve encoded slashes and strip redundant uploads prefix)
      const cleanKey = normaliseKey(rawKey);
      if (!cleanKey || cleanKey.includes('..')) {
        return res.status(400).json({ error: 'Invalid key' });
      }

      // 0. Route Telegram keys (tg:<file_id>/... and tgmsg:<msg_id>/...) with full HTTP 206 Range support
      const storage = getStorageAdapter();
      if (isTelegramKey(cleanKey)) {
        if (storage.streamToResponse) {
          const handled = await storage.streamToResponse(cleanKey, req, res);
          if (handled) return;
        }
        // If this Telegram key is a user avatar and failed to stream, 404 so UI falls back to initials
        if (queryOne<{ id: string }>('SELECT id FROM users WHERE avatar_url = ?', [cleanKey])) {
          res.setHeader('Cache-Control', 'no-store');
          return res.status(404).json({ error: 'Not found' });
        }
      }

      // 1. Try local disk paths
      let targetPath: string;
      try {
        targetPath = localStorageAdapter.getFilePath(cleanKey);
      } catch {
        return res.status(400).json({ error: 'Invalid key' });
      }
      
      // If requested file does not exist, check fallback variants (thumb <-> full res)
      if (!fs.existsSync(targetPath)) {
        if (cleanKey.includes('_thumb')) {
          const altKey = cleanKey.replace(/_thumb\.[a-zA-Z0-9]+$/, (ext) => ext.replace('_thumb', ''));
          const altPath = localStorageAdapter.getFilePath(altKey);
          if (fs.existsSync(altPath)) {
            targetPath = altPath;
          }
        } else {
          // Full resolution requested but maybe only thumb exists
          const ext = path.extname(cleanKey);
          const base = cleanKey.slice(0, cleanKey.length - ext.length);
          const thumbKey = `${base}_thumb${ext}`;
          const thumbPath = localStorageAdapter.getFilePath(thumbKey);
          if (fs.existsSync(thumbPath)) {
            targetPath = thumbPath;
          }
        }
      }

      // If still not found, look for the *same* upload under a different extension/thumb suffix
      // (names are `<timestamp>_<uuid>[_thumb].<ext>`); never match a different file.
      if (!fs.existsSync(targetPath)) {
        const parts = cleanKey.split('/');
        const fileName = parts[parts.length - 1] || '';
        const stem = fileName.split('_').slice(0, 2).join('_').replace(/\.[^.]+$/, '');

        if (parts.length === 3 && parts[0] === 'posts' && /^[A-Za-z0-9-]+$/.test(parts[1]) && /^\d{10,}_[A-Za-z0-9-]{8,}$/.test(stem)) {
          const userDir = path.resolve(process.cwd(), 'uploads', 'posts', parts[1]);
          if (fs.existsSync(userDir)) {
            const matched = fs.readdirSync(userDir).find((f) => f.startsWith(stem) && isAllowedMediaName(f));
            if (matched) {
              targetPath = path.join(userDir, matched);
            }
          }
        }
      }

      if (fs.existsSync(targetPath)) {
        const ext = path.extname(targetPath).toLowerCase();
        const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';

        const stat = fs.statSync(targetPath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'private, max-age=86400');

        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
          if (m && (m[1] !== '' || m[2] !== '')) {
            let start = 0;
            let end = stat.size - 1;
            if (m[1] === '') {
              start = Math.max(0, stat.size - parseInt(m[2], 10));
            } else {
              start = parseInt(m[1], 10);
              if (m[2] !== '') end = Math.min(parseInt(m[2], 10), stat.size - 1);
            }
            if (start < stat.size && start <= end) {
              res.status(206);
              res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
              res.setHeader('Content-Length', end - start + 1);
              return fs.createReadStream(targetPath, { start, end }).pipe(res);
            }
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            return res.status(416).end();
          }
        }

        res.setHeader('Content-Length', stat.size);
        return fs.createReadStream(targetPath).pipe(res);
      }

      // 2. Try S3 / Backblaze B2 storage adapter via streaming pipe
      if (storage.getObjectStream) {
        const streamObj = await storage.getObjectStream(cleanKey);
        if (streamObj && streamObj.stream) {
          res.setHeader('Content-Type', streamObj.contentType || 'image/jpeg');
          if (streamObj.contentLength) {
            res.setHeader('Content-Length', streamObj.contentLength);
          }
          res.setHeader('Cache-Control', 'private, max-age=86400, immutable');

          const passForDisk = new PassThrough();
          const passForRes = new PassThrough();
          streamObj.stream.pipe(passForDisk);
          streamObj.stream.pipe(passForRes);

          // Cache to local disk in background for instant subsequent requests
          try {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const diskWrite = fs.createWriteStream(targetPath);
            diskWrite.on('error', (err) => console.warn('Disk cache write notice:', err.message));
            passForDisk.pipe(diskWrite);
          } catch {}

          return passForRes.pipe(res);
        }
      } else if (storage.getObject) {
        const obj = await storage.getObject(cleanKey);
        if (obj && obj.data) {
          try {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, obj.data);
          } catch {}

          res.setHeader('Content-Type', obj.contentType || 'image/jpeg');
          res.setHeader('Content-Length', obj.data.length);
          res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
          return res.send(obj.data);
        }
      }

      // Profile photos never get the generic placeholder: a missing avatar must
      // read as "gone" (404) so the UI can fall back to the colour initials.
      if (cleanKey.startsWith('avatars/')) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'Not found' });
      }

      // 3. Fallback graceful SVG placeholder to avoid ugly broken image icon
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1e1e2f"/>
              <stop offset="100%" stop-color="#2a2a42"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <circle cx="400" cy="270" r="45" fill="#f59e0b" opacity="0.2"/>
          <path d="M370 295 L400 245 L430 295 Z" fill="#f59e0b" opacity="0.8"/>
          <circle cx="430" cy="245" r="9" fill="#f43f5e" opacity="0.8"/>
        </svg>`
      );
    } catch (err: any) {
      console.error('Storage view error:', err);
      res.status(500).send('Failed to stream media');
    }
  });

  // --- API Routes ---
  app.use('/api/auth', authRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/albums', albumsRouter);
  app.use('/api/placements', placementsRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/reactions', reactionsRouter);
  app.use('/api/feed', feedRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/ai', aiRouter);

  // App configuration & environment capability flags
  app.get('/api/config', (_req, res) => {
    res.json({
      isDeleteProtected: isDeleteProtected(),
      isRender: Boolean(process.env.RENDER),
    });
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;

  const distDir = path.resolve(__dirname, 'dist');
  const distIndexHtml = path.join(distDir, 'index.html');
  const hasDist = fs.existsSync(distIndexHtml);

  if (process.env.NODE_ENV === 'production') {
    console.log('Serving production static build from dist/');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexHtml);
    });
  } else {
    // Mount Vite middleware in development mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nest server listening on http://0.0.0.0:${PORT}`);
    startTelegramDeletionWatcher();
  });

  const gracefulShutdown = async () => {
    stopTelegramDeletionWatcher();
    try {
      await closeNeon(); // flush any pending database writes to Neon before exiting
    } catch {}
    try {
      await getStorageAdapter().disconnect?.();
    } catch {}
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', gracefulShutdown);
  process.once('SIGINT', gracefulShutdown);
}

// Only start when executed directly as main script
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal server boot error:', err);
    process.exit(1);
  });
}
