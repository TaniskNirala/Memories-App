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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  await getDb();
  await seedDatabase(false);

  const app = express();

  // CORS and preflight handling for browser and iframe preview
  app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(cookieParser());
  // No size limits on requests
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));
  app.use(express.raw({ type: '*/*', limit: '500mb' }));

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

  // Short-lived signed view endpoint
  app.get('/api/storage/view', (req, res) => {
    const { key, token, expires } = req.query as { key?: string; token?: string; expires?: string };
    if (!key || !token || !expires) {
      return res.status(400).json({ error: 'Missing view authorization parameters' });
    }

    const expNumber = parseInt(expires, 10);
    const isValid = localStorageAdapter.verifyToken(key, expNumber, 'view', token);
    if (!isValid) {
      return res.status(403).json({ error: 'Invalid or expired media view link' });
    }

    const targetPath = localStorageAdapter.getFilePath(key);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).send('File not found');
    }

    // Determine mime type
    const ext = path.extname(targetPath).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.svg') mimeType = 'image/svg+xml';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.mp3') mimeType = 'audio/mpeg';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(targetPath).pipe(res);
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

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
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
