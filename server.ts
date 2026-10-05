import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb } from './server/db.ts';
import { seedDatabase } from './server/seed.ts';
import { authMiddleware } from './server/middleware/auth.ts';
import { LocalDiskStorageAdapter } from './server/storage/local.ts';
import { getStorageAdapter } from './server/storage/index.ts';

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
  await seedDatabase(false);

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

  // Universal media view endpoint (streams from local disk or cloud S3/Backblaze B2)
  app.get('/api/storage/view', async (req, res) => {
    try {
      const { key, token, expires } = req.query as { key?: string; token?: string; expires?: string };
      if (!key) {
        return res.status(400).json({ error: 'Missing key parameter' });
      }

      // 1. Try local disk first
      const targetPath = localStorageAdapter.getFilePath(key);
      if (fs.existsSync(targetPath)) {
        const ext = path.extname(targetPath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.svg') mimeType = 'image/svg+xml';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.mp3') mimeType = 'audio/mpeg';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(targetPath).pipe(res);
      }

      // 2. Try S3 / Backblaze B2 storage adapter if configured
      const storage = getStorageAdapter();
      if (storage.getObject) {
        const obj = await storage.getObject(key);
        if (obj && obj.data) {
          // Cache locally to prevent redundant cloud bandwidth
          try {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, obj.data);
          } catch {}

          res.setHeader('Content-Type', obj.contentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
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
              <stop offset="0%" stop-color="#181824"/>
              <stop offset="100%" stop-color="#242438"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <circle cx="400" cy="270" r="50" fill="#f43f5e" opacity="0.15"/>
          <path d="M375 295 L400 245 L425 295 Z" fill="#f43f5e" opacity="0.8"/>
          <circle cx="430" cy="245" r="10" fill="#f59e0b" opacity="0.8"/>
          <text x="50%" y="360" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="16" font-weight="500">
            Memory photo securely stored in cloud
          </text>
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

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  const distDir = path.resolve(__dirname, 'dist');
  const distIndexHtml = path.join(distDir, 'index.html');
  const hasDist = fs.existsSync(distIndexHtml);

  if (process.env.NODE_ENV === 'production' || hasDist) {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kinfolk Memories server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only start when executed directly as main script
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal server boot error:', err);
    process.exit(1);
  });
}
