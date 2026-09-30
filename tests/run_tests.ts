import { createApp } from '../server.ts';
import { queryOne, run } from '../server/db.ts';
import http from 'http';

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
  return data.token;
}

async function runTests() {
  process.env.NODE_ENV = 'test';
  console.log('--- Starting Kinfolk Memories Automated Tests ---');

  const app = await createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
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
    // Summary
    // -------------------------------------------------------------
    console.log('\n=======================================');
    console.log('TEST SUMMARY:');
    let allPassed = true;
    for (const r of results) {
      console.log(`${r.passed ? '✓ PASS' : '✗ FAIL'} : ${r.name}`);
      if (!r.passed) allPassed = false;
    }
    console.log('=======================================');

    server.closeAllConnections?.();
    server.close();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Fatal test error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
