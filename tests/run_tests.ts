import { createApp } from '../server.ts';
import { LocalDiskStorageAdapter } from '../server/storage/local.ts';
import { queryOne, run } from '../server/db.ts';
import http from 'http';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function loginUser(baseUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 403) {
    throw new Error(`Login failed for ${username}: ${data.error}`);
  }
  // Sessions are cookie-only now: pull the session value out of Set-Cookie (it works as a Bearer token too)
  const setCookie = res.headers.getSetCookie?.() || [];
  const match = setCookie.map((c) => /kinfolk_session=([^;]+)/.exec(c)).find(Boolean);
  return match ? decodeURIComponent(match[1]) : (data.token as string);
}

function rawRequest(baseUrl: string, pathname: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl);
    const req = http.request({ host: u.hostname, port: u.port, path: pathname, method, headers }, (r) => {
      r.resume();
      resolve({ status: r.statusCode || 0, headers: r.headers });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  process.env.NODE_ENV = 'test';
  const testDbFile = path.resolve(process.cwd(), 'data/test_sandbox.sqlite');
  process.env.DB_PATH = testDbFile;
  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }
  console.log('--- Starting Nest Automated Tests ---');

  const app = await createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // Seed isolated test fixtures in test runner
    const now = new Date().toISOString();
    const secretHash = await bcrypt.hash('secret123', 10);
    const adminHash = await bcrypt.hash('admin123', 10);

    const testUsers = [
      { id: 'u-elena', username: 'elena', pass: secretHash, name: 'Elena Rostova', role: 'pending', color: '#10b981' },
      { id: 'u-maya', username: 'maya', pass: secretHash, name: 'Maya Lin', role: 'member', color: '#3b82f6' },
      { id: 'u-leo', username: 'leo', pass: secretHash, name: 'Leo Torres', role: 'member', color: '#8b5cf6' },
      { id: 'u-sam', username: 'sam', pass: secretHash, name: 'Sam Rivera', role: 'member', color: '#ec4899' },
      { id: 'u-admin', username: 'admin', pass: adminHash, name: 'Jordan Admin', role: 'admin', color: '#f59e0b' },
    ];

    for (const u of testUsers) {
      run(
        `INSERT OR REPLACE INTO users (id, username, password_hash, display_name, role, status, avatar_color, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        [u.id, u.username, u.pass, u.name, u.role, u.color, now]
      );
    }

    const gHikersId = 'g-weekend-hikers';
    const gRecipeId = 'g-recipe-club';
    const gEveryoneId = '56896808-0e5c-4303-b413-98b0eb3ad540';

    run(
      `INSERT OR REPLACE INTO groups (id, name, description, creator_id, is_everyone, created_at)
       VALUES (?, 'Everyone', 'Family circle containing all approved members', 'u-admin', 1, ?)`,
      [gEveryoneId, now]
    );
    run(
      `INSERT OR REPLACE INTO groups (id, name, description, creator_id, is_everyone, created_at)
       VALUES (?, 'Weekend Hikers', 'Hiking trails and summits', 'u-maya', 0, ?)`,
      [gHikersId, now]
    );
    run(
      `INSERT OR REPLACE INTO groups (id, name, description, creator_id, is_everyone, created_at)
       VALUES (?, 'Recipe Club', 'Cooking experiments and favorites', 'u-sam', 0, ?)`,
      [gRecipeId, now]
    );

    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-maya', ?)`, [gEveryoneId, now]);
    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-leo', ?)`, [gEveryoneId, now]);
    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-sam', ?)`, [gEveryoneId, now]);
    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-admin', ?)`, [gEveryoneId, now]);

    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-maya', ?)`, [gHikersId, now]);
    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-leo', ?)`, [gHikersId, now]);
    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-sam', ?)`, [gRecipeId, now]);
    run(`INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, 'u-leo', ?)`, [gRecipeId, now]);

    const samPostId = 'p-sam-private';
    run(
      `INSERT OR REPLACE INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, deleted_at, created_at)
       VALUES (?, 'u-sam', 'Sam Private Post', ?, ?, 'taken_at', 1, NULL, ?)`,
      [samPostId, now, now, now]
    );
    run(`DELETE FROM item_groups WHERE item_id = ?`, [samPostId]);

    const mayaPostId = 'p-maya-hike';
    run(
      `INSERT OR REPLACE INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, deleted_at, created_at)
       VALUES (?, 'u-maya', 'Trail Summit Hike', ?, ?, 'taken_at', 1, NULL, ?)`,
      [mayaPostId, now, now, now]
    );
    run(
      `INSERT OR REPLACE INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
       VALUES ('pf-maya-1', ?, 'posts/u-maya/trail.jpg', 'photo', 0, 'posts/u-maya/trail.jpg', 12345, 'image/jpeg', 1200, 800)`,
      [mayaPostId]
    );
    run(
      `INSERT OR REPLACE INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
       VALUES ('ig-hike-wknd', 'post', ?, ?, 'u-maya', 0, 'approved', ?)`,
      [mayaPostId, gHikersId, now]
    );
    run(
      `INSERT OR REPLACE INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
       VALUES ('ig-hike-ref-recipe', 'post', ?, ?, 'u-leo', 1, 'pending_owner_approval', ?)`,
      [mayaPostId, gRecipeId, now]
    );
    run(
      `INSERT OR REPLACE INTO comments (id, target_type, target_id, group_id, author_id, text, created_at)
       VALUES ('c-hiker-1', 'post', ?, ?, 'u-leo', 'Great hike on the trail!', ?)`,
      [mayaPostId, gHikersId, now]
    );
    // -------------------------------------------------------------
    // Test Case 1: Pending users see nothing
    // -------------------------------------------------------------
    console.log('\n[Test 1] Pending users see nothing:');
    try {
      run("UPDATE users SET role = 'pending' WHERE username = 'elena'");
      const elenaToken = await loginUser(baseUrl, 'elena', 'secret123');
      const feedRes = await fetch(`${baseUrl}/api/feed`, {
        headers: { Authorization: `Bearer ${elenaToken}` },
      });

      if (feedRes.status !== 403) {
        throw new Error(`Expected status 403 for pending user feed, got ${feedRes.status}`);
      }

      const feedData = await feedRes.json();
      if (!feedData.isPending) {
        throw new Error(`Expected isPending flag in error response, got ${JSON.stringify(feedData)}`);
      }

      const groupsRes = await fetch(`${baseUrl}/api/groups`, {
        headers: { Authorization: `Bearer ${elenaToken}` },
      });

      if (groupsRes.status !== 403) {
        throw new Error(`Expected status 403 for pending user groups, got ${groupsRes.status}`);
      }

      console.log('✓ PASS: Pending user cannot access feed or groups (HTTP 403 Forbidden with isPending flag)');
      results.push({ name: 'Pending users see nothing', passed: true });
    } catch (err: any) {
      console.error('✗ FAIL: Test 1 failed:', err.message);
      results.push({ name: 'Pending users see nothing', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 2: A private post is invisible to others
    // -------------------------------------------------------------
    console.log('\n[Test 2] A private post is invisible to others:');
    try {
      // Find Sam's private post (no item_groups entries)
      const samPrivatePost = queryOne<any>(
        `SELECT p.id FROM posts p
         LEFT JOIN item_groups ig ON ig.item_type = 'post' AND ig.item_id = p.id
         WHERE p.owner_id = (SELECT id FROM users WHERE username = 'sam')
         GROUP BY p.id HAVING COUNT(ig.id) = 0`
      );

      if (!samPrivatePost) {
        throw new Error('Seed private post for Sam not found');
      }

      // Maya attempts to fetch Sam's private post
      const mayaToken = await loginUser(baseUrl, 'maya', 'secret123');
      const mayaGetRes = await fetch(`${baseUrl}/api/posts/${samPrivatePost.id}`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      });

      if (mayaGetRes.status !== 404 && mayaGetRes.status !== 403) {
        throw new Error(`Expected status 404/403 when Maya accesses Sam's private post, got ${mayaGetRes.status}`);
      }

      // Maya's feed must not contain Sam's private post
      const mayaFeedRes = await fetch(`${baseUrl}/api/feed`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      });
      const mayaFeed = await mayaFeedRes.json();
      const hasPrivatePost = mayaFeed.items?.some((i: any) => i.id === samPrivatePost.id);

      if (hasPrivatePost) {
        throw new Error("Sam's private post appeared in Maya's feed!");
      }

      // Sam CAN view his own post
      const samToken = await loginUser(baseUrl, 'sam', 'secret123');
      const samGetRes = await fetch(`${baseUrl}/api/posts/${samPrivatePost.id}`, {
        headers: { Authorization: `Bearer ${samToken}` },
      });
      if (samGetRes.status !== 200) {
        throw new Error(`Expected status 200 for Sam viewing his own post, got ${samGetRes.status}`);
      }

      console.log("✓ PASS: Sam's private post is completely invisible to Maya (404 & excluded from feed), but visible to owner Sam");
      results.push({ name: 'Private post is invisible to others', passed: true });
    } catch (err: any) {
      console.error('✗ FAIL: Test 2 failed:', err.message);
      results.push({ name: 'Private post is invisible to others', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 3: Reference into a group shows locked placeholder to members who cannot see original
    // -------------------------------------------------------------
    console.log('\n[Test 3] Reference into group shows locked placeholder:');
    try {
      // Find Maya's post that Leo referenced into Recipe Club (where reference_status = 'pending_owner_approval')
      const refPlacement = queryOne<any>(
        `SELECT ig.item_id, ig.group_id
         FROM item_groups ig
         JOIN group_members gm ON ig.group_id = gm.group_id
         JOIN users u ON gm.user_id = u.id AND u.username = 'sam'
         WHERE ig.is_reference = 1 AND ig.reference_status = 'pending_owner_approval'`
      );

      if (!refPlacement) {
        throw new Error('Seed reference request not found');
      }

      // Sam is a member of Recipe Club, but not Weekend Hikers
      const samToken = await loginUser(baseUrl, 'sam', 'secret123');
      const samPostRes = await fetch(`${baseUrl}/api/posts/${refPlacement.item_id}`, {
        headers: { Authorization: `Bearer ${samToken}` },
      });
      const samPostData = await samPostRes.json();

      if (!samPostData.isLocked) {
        throw new Error(`Expected isLocked = true for Sam viewing referenced post, got: ${JSON.stringify(samPostData)}`);
      }

      if (!samPostData.lockedReason || !samPostData.lockedReason.includes('Pending approval')) {
        throw new Error(`Expected lockedReason with 'Pending approval', got: ${samPostData.lockedReason}`);
      }

      // Feed check for Sam in Recipe Club
      const samFeedRes = await fetch(`${baseUrl}/api/feed?groupId=${refPlacement.group_id}`, {
        headers: { Authorization: `Bearer ${samToken}` },
      });
      const samFeed = await samFeedRes.json();
      const lockedFeedItem = samFeed.items?.find((i: any) => i.id === refPlacement.item_id);

      if (!lockedFeedItem || !lockedFeedItem.isLockedPlaceholder) {
        throw new Error('Referenced post did not appear as locked placeholder in Recipe Club feed');
      }

      console.log('✓ PASS: Referenced post displays locked placeholder with owner approval notice to unapproved viewers');
      results.push({ name: 'Reference shows locked placeholder to non-authorized members', passed: true });
    } catch (err: any) {
      console.error('✗ FAIL: Test 3 failed:', err.message);
      results.push({ name: 'Reference shows locked placeholder', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 4: Comments in one group are not visible from another group
    // -------------------------------------------------------------
    console.log('\n[Test 4] Comments in one group are not visible from another group:');
    try {
      // Find comment on Post 1 in Weekend Hikers
      const hikersComment = queryOne<any>(
        `SELECT c.*, g.name as group_name
         FROM comments c
         JOIN groups g ON c.group_id = g.id
         WHERE g.name = 'Weekend Hikers' LIMIT 1`
      );

      if (!hikersComment) {
        throw new Error('Seed comment in Weekend Hikers not found');
      }

      // Sam (not in Weekend Hikers) attempts to fetch comments for that group placement
      const samToken = await loginUser(baseUrl, 'sam', 'secret123');
      const samCommentsRes = await fetch(
        `${baseUrl}/api/comments?targetType=post&targetId=${hikersComment.target_id}&groupId=${hikersComment.group_id}`,
        { headers: { Authorization: `Bearer ${samToken}` } }
      );

      if (samCommentsRes.status !== 403) {
        throw new Error(`Expected status 403 for non-member accessing group comments, got ${samCommentsRes.status}`);
      }

      // Leo (in Weekend Hikers) CAN fetch comments
      const leoToken = await loginUser(baseUrl, 'leo', 'secret123');
      const leoCommentsRes = await fetch(
        `${baseUrl}/api/comments?targetType=post&targetId=${hikersComment.target_id}&groupId=${hikersComment.group_id}`,
        { headers: { Authorization: `Bearer ${leoToken}` } }
      );

      if (leoCommentsRes.status !== 200) {
        throw new Error(`Expected status 200 for member accessing group comments, got ${leoCommentsRes.status}`);
      }

      const leoComments = await leoCommentsRes.json();
      if (!Array.isArray(leoComments.comments) || leoComments.comments.length === 0) {
        throw new Error('Expected comments in Weekend Hikers for Leo');
      }

      // Also check another group (e.g. Everyone): comments from Weekend Hikers do NOT appear in Everyone
      const everyoneGroup = queryOne<any>('SELECT id FROM groups WHERE is_everyone = 1');
      const everyoneCommentsRes = await fetch(
        `${baseUrl}/api/comments?targetType=post&targetId=${hikersComment.target_id}&groupId=${everyoneGroup.id}`,
        { headers: { Authorization: `Bearer ${leoToken}` } }
      );
      const everyoneComments = await everyoneCommentsRes.json();
      const leakedComment = everyoneComments.comments?.find((c: any) => c.id === hikersComment.id);

      if (leakedComment) {
        throw new Error('Comment from Weekend Hikers leaked into Everyone circle comments!');
      }

      console.log('✓ PASS: Group comments are strictly isolated per group placement and require circle membership');
      results.push({ name: 'Comments in one group are not visible from another group', passed: true });
    } catch (err: any) {
      console.error('✗ FAIL: Test 4 failed:', err.message);
      results.push({ name: 'Comments isolation', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 5: /switch-user passwordless login is gone
    // -------------------------------------------------------------
    console.log('\n[Test 5] /switch-user endpoint removed:');
    try {
      const r = await fetch(`${baseUrl}/api/auth/switch-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin' }),
      });
      const body: any = await r.json().catch(() => ({}));
      if (r.status === 200 || body.token) throw new Error(`switch-user still issues a session (status ${r.status})`);
      console.log(`  switch-user returned ${r.status}, no token`);
      results.push({ name: 'switch-user endpoint removed', passed: true });
    } catch (err: any) {
      results.push({ name: 'switch-user endpoint removed', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 6: Media endpoints require authentication
    // -------------------------------------------------------------
    console.log('\n[Test 6] Media endpoints require auth:');
    try {
      const mediaDir = path.resolve(process.cwd(), 'uploads', 'posts', 'u-maya');
      fs.mkdirSync(mediaDir, { recursive: true });
      const mediaFile = path.join(mediaDir, 'authtest.jpg');
      fs.writeFileSync(mediaFile, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const urls = [
        '/api/storage/view?key=posts/u-maya/authtest.jpg',
        '/uploads/posts/u-maya/authtest.jpg',
        '/api/storage/file/1',
        '/api/storage/file/1/x.jpg',
      ];
      for (const u of urls) {
        const r = await fetch(`${baseUrl}${u}`);
        if (r.status !== 401) throw new Error(`${u} returned ${r.status} without login (expected 401)`);
      }

      // Forged / bad token must be rejected
      const bad = await fetch(`${baseUrl}/api/storage/view?key=posts/u-maya/authtest.jpg&token=deadbeef&expires=${Date.now() + 60000}`);
      if (bad.status !== 401) throw new Error(`bad token returned ${bad.status}`);

      // Logged-in approved member can fetch
      const mayaToken = await loginUser(baseUrl, 'maya', 'secret123');
      const authH = { Authorization: `Bearer ${mayaToken}` };
      for (const u of ['/api/storage/view?key=posts/u-maya/authtest.jpg', '/uploads/posts/u-maya/authtest.jpg']) {
        const r = await fetch(`${baseUrl}${u}`, { headers: authH });
        if (r.status !== 200) throw new Error(`${u} returned ${r.status} with login (expected 200)`);
      }

      // Pending user is blocked
      run("UPDATE users SET role = 'pending' WHERE username = 'elena'");
      const elenaToken = await loginUser(baseUrl, 'elena', 'secret123');
      const pr = await fetch(`${baseUrl}/api/storage/view?key=posts/u-maya/authtest.jpg`, { headers: { Authorization: `Bearer ${elenaToken}` } });
      if (pr.status !== 401) throw new Error(`pending user got ${pr.status}`);

      fs.unlinkSync(mediaFile);
      results.push({ name: 'Media endpoints require auth', passed: true });
    } catch (err: any) {
      results.push({ name: 'Media endpoints require auth', passed: false, error: err.message });
    }


    // -------------------------------------------------------------
    // Test Case 7: Session token is not exposed to scripts
    // -------------------------------------------------------------
    console.log('\n[Test 7] Login does not return the session token in the body:');
    try {
      const r = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'maya', password: 'secret123' }),
      });
      const body: any = await r.json();
      if (body.token) throw new Error('token present in JSON body');
      const sc = (r.headers.getSetCookie?.() || []).join(';');
      if (!/HttpOnly/i.test(sc) || !/SameSite=Lax/i.test(sc)) throw new Error(`cookie flags wrong: ${sc}`);
      const stored = queryOne<{ n: number }>("SELECT COUNT(*) as n FROM sessions WHERE LENGTH(token) = 64");
      if (!stored || stored.n < 1) throw new Error('sessions are not stored hashed');
      results.push({ name: 'Session token httpOnly + hashed at rest', passed: true });
    } catch (err: any) {
      results.push({ name: 'Session token httpOnly + hashed at rest', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 8: CORS and headers
    // -------------------------------------------------------------
    console.log('\n[Test 8] CORS allow-list and security headers:');
    try {
      const evil = await rawRequest(baseUrl, '/api/health', { Origin: 'https://evil.example' });
      if (evil.headers['access-control-allow-origin']) throw new Error('evil origin was reflected');
      const evilPost = await rawRequest(baseUrl, '/api/auth/logout', { Origin: 'https://evil.example' }, 'POST');
      if (evilPost.status !== 403) throw new Error(`cross-site POST returned ${evilPost.status}`);
      const same = await rawRequest(baseUrl, '/api/health', { Origin: baseUrl });
      if (same.headers['access-control-allow-origin'] !== baseUrl) throw new Error('same-origin request not allowed');
      if (same.headers['x-powered-by']) throw new Error('X-Powered-By still exposed');
      if (same.headers['x-content-type-options'] !== 'nosniff') throw new Error('nosniff missing');
      results.push({ name: 'CORS allow-list and security headers', passed: true });
    } catch (err: any) {
      results.push({ name: 'CORS allow-list and security headers', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 9: Upload hardening
    // -------------------------------------------------------------
    console.log('\n[Test 9] Upload hardening:');
    try {
      // Token forged with the old hard-coded secret must be rejected
      const expires = Date.now() + 600000;
      const key = 'posts/u-maya/evil.jpg';
      const forged = crypto.createHmac('sha256', 'kinfolk-local-secret-key-32chars!!').update(`upload:${key}:${expires}`).digest('hex');
      const put = await fetch(`${baseUrl}/api/storage/upload?key=${encodeURIComponent(key)}&token=${forged}&expires=${expires}`, { method: 'PUT', body: 'x' });
      if (put.status !== 403) throw new Error(`forged upload token returned ${put.status}`);

      // Non-media extensions can never be signed
      const { LocalDiskStorageAdapter } = await import('../server/storage/local.ts');
      let threw = false;
      try {
        await new LocalDiskStorageAdapter().getSignedUploadUrl('posts/u-maya/evil.html', 'text/html');
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('html key could be signed for upload');

      // Multipart upload of an HTML file is refused
      const mayaToken = await loginUser(baseUrl, 'maya', 'secret123');
      const form = new FormData();
      form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'evil.html');
      const up = await fetch(`${baseUrl}/api/posts/upload-file`, { method: 'POST', headers: { Authorization: `Bearer ${mayaToken}` }, body: form });
      if (up.status !== 400) throw new Error(`html upload returned ${up.status}`);
      results.push({ name: 'Upload hardening', passed: true });
    } catch (err: any) {
      results.push({ name: 'Upload hardening', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 10: Per-file authorization + body size limits
    // -------------------------------------------------------------
    console.log('\n[Test 10] Per-file media authorization and body limits:');
    try {
      const dir = path.resolve(process.cwd(), 'uploads', 'posts', 'u-maya');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'private-test.jpg');
      fs.writeFileSync(f, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      const leoToken = await loginUser(baseUrl, 'leo', 'secret123');
      const r = await fetch(`${baseUrl}/api/storage/view?key=posts/u-maya/private-test.jpg`, { headers: { Authorization: `Bearer ${leoToken}` } });
      fs.unlinkSync(f);
      if (r.status !== 403) throw new Error(`other member got ${r.status} for an unshared file`);

      const big = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'x', password: 'a'.repeat(2 * 1024 * 1024) }),
      });
      if (big.status !== 413) throw new Error(`2 MB JSON body returned ${big.status}`);
      results.push({ name: 'Per-file authorization + body limits', passed: true });
    } catch (err: any) {
      results.push({ name: 'Per-file authorization + body limits', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test Case 11: Password policy, re-auth on delete, rate limiting
    // -------------------------------------------------------------
    console.log('\n[Test 11] Password policy, delete re-auth, login rate limit:');
    try {
      const weak = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'weakling', password: '123456', displayName: 'Weak' }),
      });
      if (weak.status !== 400) throw new Error(`weak password accepted (${weak.status})`);

      const mayaToken = await loginUser(baseUrl, 'maya', 'secret123');
      const noPw = await fetch(`${baseUrl}/api/auth/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${mayaToken}`, 'Content-Type': 'application/json' }, body: '{}' });
      if (noPw.status !== 403) throw new Error(`account delete without password returned ${noPw.status}`);

      let blocked = false;
      for (let i = 0; i < 8; i++) {
        const r = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'ratelimit-target', password: `wrong-${i}` }),
        });
        if (r.status === 429) {
          blocked = true;
          break;
        }
      }
      if (!blocked) throw new Error('login was never rate limited');
      results.push({ name: 'Password policy, delete re-auth, login rate limit', passed: true });
    } catch (err: any) {
      results.push({ name: 'Password policy, delete re-auth, login rate limit', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Test 12: Profile photo upload, replace and remove
    // -------------------------------------------------------------
    console.log('\n[Test 12] Profile photo upload, replace and remove:');
    try {
      const mayaToken = await loginUser(baseUrl, 'maya', 'secret123');
      const auth = { Authorization: `Bearer ${mayaToken}` };

      // A 1x1 PNG is enough to exercise the whole path
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      const asForm = (name: string, type: string, bytes: Buffer) => {
        const fd = new FormData();
        // Copy into a plain Uint8Array so the Blob constructor accepts it
        fd.append('avatar', new Blob([new Uint8Array(bytes)], { type }), name);
        return fd;
      };

      const up = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'POST', headers: auth, body: asForm('a.png', 'image/png', png) });
      const upBody: any = await up.json();
      if (up.status !== 200 || !upBody.avatarUrl) {
        throw new Error(`avatar upload failed: ${up.status} ${JSON.stringify(upBody)}`);
      }

      // Stored under a namespaced key so the storage lane and the read path agree
      const storedKey = decodeURIComponent(String(upBody.avatarUrl).split('key=')[1] || '');
      if (!/^avatars\/[^/]+\/[^/]+$/.test(storedKey)) {
        throw new Error(`avatar key is not namespaced: ${storedKey}`);
      }

      // The photo is served back to the signed-in owner…
      const view = await fetch(`${baseUrl}${upBody.avatarUrl}`, { headers: auth });
      if (view.status !== 200) throw new Error(`uploaded photo not readable (${view.status})`);

      // …with the actual image bytes, not an error page or a colour tile
      const servedBytes = Buffer.from(await view.arrayBuffer());
      if (!servedBytes.equals(png)) {
        throw new Error(`served avatar bytes do not match the upload (${servedBytes.length} vs ${png.length})`);
      }
      const servedType = view.headers.get('content-type') || '';
      if (!servedType.startsWith('image/')) throw new Error(`avatar served as ${servedType}`);

      // …and is echoed by /me and by other people's feeds
      const me: any = await (await fetch(`${baseUrl}/api/auth/me`, { headers: auth })).json();
      if (me.user?.avatarUrl !== upBody.avatarUrl) throw new Error('/me does not expose avatarUrl');

      const feedRes = await fetch(`${baseUrl}/api/feed`, { headers: auth });
      const feed: any = await feedRes.json();
      const ownPost = (feed.items || []).find((i: any) => i.owner?.username === 'maya');
      if (!ownPost || ownPost.owner.avatarUrl !== upBody.avatarUrl) {
        throw new Error('feed items do not carry the owner photo');
      }

      // Replacing returns a new file and the old one is gone
      const up2 = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'POST', headers: auth, body: asForm('b.png', 'image/png', png) });
      const upBody2: any = await up2.json();
      if (upBody2.avatarUrl === upBody.avatarUrl) throw new Error('replace returned the same file');

      // Wrong type and oversize uploads are rejected with a JSON error
      const gif = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'POST', headers: auth, body: asForm('x.gif', 'image/gif', png) });
      if (gif.status !== 400) throw new Error(`gif upload returned ${gif.status}`);
      const gifBody: any = await gif.json();
      if (!gifBody.error) throw new Error('gif rejection was not JSON');

      const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 + 16)]);
      const tooBig = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'POST', headers: auth, body: asForm('big.png', 'image/png', big) });
      const tooBigBody: any = await tooBig.json();
      if (tooBig.status !== 400 || !tooBigBody.error) {
        throw new Error(`oversize upload returned ${tooBig.status} ${JSON.stringify(tooBigBody)}`);
      }

      // Anonymous uploads are refused
      const anon = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'POST', body: asForm('a.png', 'image/png', png) });
      if (anon.status !== 401) throw new Error(`anonymous upload returned ${anon.status}`);

      // Removing falls back to the colour initials
      const del = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeAvatar: true }),
      });
      if (del.status !== 200) throw new Error(`avatar removal returned ${del.status}`);
      const me2: any = await (await fetch(`${baseUrl}/api/auth/me`, { headers: auth })).json();
      if (me2.user?.avatarUrl) throw new Error('avatarUrl still set after removal');

      // The object itself is deleted from storage (the view route then 404s)
      const goneKey = decodeURIComponent(upBody2.avatarUrl.split('key=')[1]);
      if (fs.existsSync(new LocalDiskStorageAdapter().getFilePath(goneKey))) {
        throw new Error('removed avatar file is still on disk');
      }
      const gone = await fetch(`${baseUrl}${upBody2.avatarUrl}`, { headers: auth });
      if (gone.status !== 404) throw new Error(`removed avatar requested back gave ${gone.status}, want 404`);
      await gone.arrayBuffer();

      results.push({ name: 'Profile photo upload / replace / remove', passed: true });
    } catch (err: any) {
      console.error('✗ FAIL: Test 12 failed:', err.message);
      results.push({ name: 'Profile photo upload / replace / remove', passed: false, error: err.message });
    }

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n=======================================');
    console.log('TEST SUMMARY:');
    let allPassed = true;
    for (const r of results) {
      console.log(`${r.passed ? '✓ PASS' : '✗ FAIL'} : ${r.name}${r.passed || !r.error ? '' : ` — ${r.error}`}`);
      if (!r.passed) allPassed = false;
    }
    console.log('=======================================');

    server.closeAllConnections?.();
    server.close();

    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }

    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Fatal test error:', err);
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }
    server.close();
    process.exit(1);
  }
}

runTests();
