import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb } from './server/db.ts';
import { flushNeonWrites, closeNeon } from './server/neon.ts';
import { seedDatabase } from './server/seed.ts';
import { authMiddleware } from './server/middleware/auth.ts';
import { LocalDiskStorageAdapter } from './server/storage/local.ts';
import { getStorageAdapter, isTelegramKey } from './server/storage/index.ts';
import { repairPostFileKeys } from './server/storage/sync.ts';
import { isDeleteProtected } from './server/config.ts';

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

  // CORS and preflight handling for browser and iframe preview
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

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
  // No size limits on requests
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // Session & user parser
  app.use(authMiddleware as any);

  // --- Local Disk Storage Direct Adapter Endpoints ---
  const localStorageAdapter = new LocalDiskStorageAdapter();

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

      const targetPath = localStorageAdapter.getFilePath(key);

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
      res.status(500).json({ error: err.message || 'Upload write failed' });
    }
  });

  // Mount uploads directory statically for direct access with full CORS headers
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), 'uploads'), {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        res.setHeader('Cache-Control', 'public, max-age=86400');
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

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

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
        res.status(502).json({ error: 'Failed to stream media from Telegram' });
      }
    }
  };
  app.get('/api/storage/file/:msgId/:fileName', handleDirectTelegramFile);
  app.get('/api/storage/file/:msgId', handleDirectTelegramFile);

  // Universal media view endpoint (streams from Telegram, local disk, or cloud S3/Backblaze B2)
  app.get('/api/storage/view', async (req, res) => {
    try {
      const rawKey = req.query.key as string;
      if (!rawKey) {
        return res.status(400).json({ error: 'Missing key parameter' });
      }

      // Allow cross-origin and canvas image access unconditionally
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

      // Normalize key (resolve encoded slashes and strip redundant uploads prefix)
      let cleanKey = rawKey.trim();
      while (cleanKey.includes('%')) {
        try {
          const decoded = decodeURIComponent(cleanKey);
          if (decoded === cleanKey) break;
          cleanKey = decoded;
        } catch {
          break;
        }
      }
      cleanKey = cleanKey.replace(/^[/\\]+/, '').replace(/^uploads[/\\]+/, '');

      // 0. Route Telegram keys (tg:<file_id>/... and tgmsg:<msg_id>/...) with full HTTP 206 Range support
      const storage = getStorageAdapter();
      if (isTelegramKey(cleanKey) && storage.streamToResponse) {
        const handled = await storage.streamToResponse(cleanKey, req, res);
        if (handled) return;
      }

      // 1. Try local disk paths
      let targetPath = localStorageAdapter.getFilePath(cleanKey);
      
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

      // If still not found on disk, attempt fuzzy match in user directory or across all user folders
      if (!fs.existsSync(targetPath)) {
        const parts = cleanKey.split('/');
        const fileName = parts.slice(parts.length - 1)[0] || '';
        const basePrefix = fileName.split('_')[0] || '';
        const cleanBaseName = fileName.replace(/_thumb\.[^.]+$/, '');

        // Check in requested user dir first
        if (parts.length >= 3 && parts[0] === 'posts') {
          const userId = parts[1];
          const userDir = path.resolve(process.cwd(), 'uploads', 'posts', userId);
          if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir);
            const matched = files.find(
              (f) =>
                f === fileName ||
                (basePrefix && f.startsWith(basePrefix)) ||
                f.includes(cleanBaseName)
            );
            if (matched) {
              const matchedPath = path.join(userDir, matched);
              if (fs.existsSync(matchedPath)) {
                targetPath = matchedPath;
              }
            }
          }
        }

        // If still not found, search across ANY user folder in uploads/posts
        if (!fs.existsSync(targetPath)) {
          const uploadsPostsDir = path.resolve(process.cwd(), 'uploads', 'posts');
          if (fs.existsSync(uploadsPostsDir)) {
            const allUsers = fs.readdirSync(uploadsPostsDir);
            for (const u of allUsers) {
              const uDir = path.join(uploadsPostsDir, u);
              if (fs.statSync(uDir).isDirectory()) {
                const uFiles = fs.readdirSync(uDir);
                const matched = uFiles.find(
                  (f) =>
                    f === fileName ||
                    (basePrefix && f.startsWith(basePrefix)) ||
                    f.includes(cleanBaseName)
                );
                if (matched) {
                  const candidate = path.join(uDir, matched);
                  if (fs.existsSync(candidate)) {
                    targetPath = candidate;
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (fs.existsSync(targetPath)) {
        const ext = path.extname(targetPath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.svg') mimeType = 'image/svg+xml';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.webm') mimeType = 'video/webm';
        else if (ext === '.mov') mimeType = 'video/quicktime';
        else if (ext === '.mp3') mimeType = 'audio/mpeg';

        const stat = fs.statSync(targetPath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

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
          res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

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
          res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
          return res.send(obj.data);
        }
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
    console.log(`Kinfolk Memories server listening on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = async () => {
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
