import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb, run, queryOne, saveDb } from './db.ts';

// Helper to generate a stylized graphic memory placeholder image with a circle sun/moon
function createSvgDataUrl(title: string, subtitle: string, bgColor: string, sunColor: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">
    <rect width="1200" height="600" rx="24" fill="${bgColor}" />
    <circle cx="1020" cy="180" r="80" fill="${sunColor}" opacity="0.9" />
    <text x="60" y="320" font-size="44" font-weight="bold" fill="white" font-family="system-ui, sans-serif" opacity="0.9">${emoji} ${title}</text>
    <text x="60" y="380" font-size="24" fill="white" opacity="0.6" font-family="system-ui, sans-serif">${subtitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function seedDatabase(force: boolean = false): Promise<void> {
  await getDb();

  const userCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (!force && (userCount?.count || 0) > 0) {
    return; // Already seeded
  }

  console.log('Seeding Kinfolk Memories database...');

  // Clear existing
  run('DELETE FROM audit_log');
  run('DELETE FROM reports');
  run('DELETE FROM notifications');
  run('DELETE FROM mentions');
  run('DELETE FROM reactions');
  run('DELETE FROM comments');
  run('DELETE FROM event_notes');
  run('DELETE FROM event_attendance');
  run('DELETE FROM item_groups');
  run('DELETE FROM album_items');
  run('DELETE FROM albums');
  run('DELETE FROM post_files');
  run('DELETE FROM posts');
  run('DELETE FROM group_members');
  run('DELETE FROM groups');
  run('DELETE FROM login_attempts');
  run('DELETE FROM password_resets');
  run('DELETE FROM sessions');
  run('DELETE FROM users');

  const defaultHash = await bcrypt.hash('secret123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);

  // 1. Users matching prototype timeline
  const riyaId = crypto.randomUUID();
  const aaravId = crypto.randomUUID();
  const kabirId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const elenaId = crypto.randomUUID();
  const samId = crypto.randomUUID();
  const mayaId = crypto.randomUUID();
  const leoId = crypto.randomUUID();

  run(
    `INSERT INTO users (id, username, password_hash, display_name, role, status, avatar_color, created_at) VALUES
     (?, 'riya', ?, 'Riya', 'member', 'active', '#ec4899', '2026-09-01T00:00:00Z'),
     (?, 'aarav', ?, 'Aarav', 'member', 'active', '#06b6d4', '2026-09-01T00:00:00Z'),
     (?, 'kabir', ?, 'Kabir', 'member', 'active', '#10b981', '2026-09-01T00:00:00Z'),
     (?, 'admin', ?, 'Admin', 'admin', 'active', '#f59e0b', '2026-09-01T00:00:00Z'),
     (?, 'elena', ?, 'Elena', 'pending', 'active', '#8b5cf6', '2026-09-01T00:00:00Z'),
     (?, 'sam', ?, 'Sam', 'member', 'active', '#3b82f6', '2026-09-01T00:00:00Z'),
     (?, 'maya', ?, 'Maya', 'member', 'active', '#ec4899', '2026-09-01T00:00:00Z'),
     (?, 'leo', ?, 'Leo', 'member', 'active', '#06b6d4', '2026-09-01T00:00:00Z')`,
    [
      riyaId, defaultHash,
      aaravId, defaultHash,
      kabirId, defaultHash,
      adminId, adminHash,
      elenaId, defaultHash,
      samId, defaultHash,
      mayaId, defaultHash,
      leoId, defaultHash,
    ]
  );

  // Sam's private post (for test 2: private post invisible to others)
  const samPrivatePostId = crypto.randomUUID();
  const svgPrivate = createSvgDataUrl('Sam Private Memory', 'Not placed in any circle', '#334155', '#64748b', '🔒');
  run(
    `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, created_at)
     VALUES (?, ?, 'Private sourdough loaf test', '2026-09-02T10:00:00Z', '2026-09-02T10:00:00Z', 'taken_at', 1, '2026-09-02T10:00:00Z')`,
    [samPrivatePostId, samId]
  );
  run(
    `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
     VALUES (?, ?, ?, 'photo', 0, ?, 100000, 'image/svg+xml', 1200, 600)`,
    [crypto.randomUUID(), samPrivatePostId, svgPrivate, svgPrivate]
  );

  // 2. Groups
  const everyoneId = crypto.randomUUID();
  const aaravRiyaId = crypto.randomUUID();
  const riyaKabirId = crypto.randomUUID();
  const hikersId = crypto.randomUUID();
  const recipeId = crypto.randomUUID();

  run(
    `INSERT INTO groups (id, name, description, creator_id, is_everyone, created_at) VALUES
     (?, 'Everyone', 'Automatic circle containing all approved friends', ?, 1, '2026-09-01T00:00:00Z'),
     (?, 'Aarav & Riya', 'Private group of two', ?, 0, '2026-09-01T00:00:00Z'),
     (?, 'Riya & Kabir', 'Private group of two', ?, 0, '2026-09-01T00:00:00Z'),
     (?, 'Weekend Hikers', 'Trails and hikes', ?, 0, '2026-09-01T00:00:00Z'),
     (?, 'Recipe Club', 'Bakes and recipes', ?, 0, '2026-09-01T00:00:00Z')`,
    [everyoneId, adminId, aaravRiyaId, aaravId, riyaKabirId, riyaId, hikersId, mayaId, recipeId, samId]
  );

  // Group Members
  for (const uid of [riyaId, aaravId, kabirId, adminId, samId, mayaId, leoId]) {
    run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [everyoneId, uid, '2026-09-01T00:00:00Z']);
  }
  for (const uid of [aaravId, riyaId]) {
    run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [aaravRiyaId, uid, '2026-09-01T00:00:00Z']);
  }
  for (const uid of [riyaId, kabirId]) {
    run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [riyaKabirId, uid, '2026-09-01T00:00:00Z']);
  }
  for (const uid of [mayaId, leoId, adminId]) {
    run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [hikersId, uid, '2026-09-01T00:00:00Z']);
  }
  for (const uid of [samId, mayaId]) {
    run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [recipeId, uid, '2026-09-01T00:00:00Z']);
  }

  // 3. Post 1: "Golden hour, Jaipur" by Aarav in Everyone (21 Sept 2026)
  const post1Id = crypto.randomUUID();
  const svgGoldenHour = createSvgDataUrl('Golden hour, Jaipur', 'Hawa Mahal viewpoint at dusk', '#71752b', '#f59e0b', '☀️');
  run(
    `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, created_at)
     VALUES (?, ?, 'Golden hour, Jaipur', '2026-09-21T18:30:00Z', '2026-09-21T18:30:00Z', 'taken_at', 1, '2026-09-21T18:30:00Z')`,
    [post1Id, aaravId]
  );
  run(
    `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
     VALUES (?, ?, ?, 'photo', 0, ?, 120000, 'image/svg+xml', 1200, 600)`,
    [crypto.randomUUID(), post1Id, svgGoldenHour, svgGoldenHour]
  );
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'post', ?, ?, ?, 0, 'approved', '2026-09-21T18:30:00Z')`,
    [crypto.randomUUID(), post1Id, everyoneId, aaravId]
  );
  // Add comment on Golden hour
  run(
    `INSERT INTO comments (id, target_type, target_id, group_id, author_id, text, parent_id, created_at)
     VALUES (?, 'post', ?, ?, ?, 'The light on the sandstone was unreal!', NULL, '2026-09-21T19:00:00Z')`,
    [crypto.randomUUID(), post1Id, everyoneId, riyaId]
  );

  // 4. Collection / Album: "Jaipur trip (540 photos)" by Riya in Everyone (12 Sept 2026)
  const albumJaipurId = crypto.randomUUID();
  run(
    `INSERT INTO albums (id, title, description, creator_id, is_event, event_date, event_place, status, created_at)
     VALUES (?, 'Jaipur trip (540 photos)', 'Four days exploring the pink city forts and bazaars.', ?, 1, '2026-09-12', 'Jaipur, Rajasthan', 'approved', '2026-09-12T14:00:00Z')`,
    [albumJaipurId, riyaId]
  );
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'album', ?, ?, ?, 0, 'approved', '2026-09-12T14:00:00Z')`,
    [crypto.randomUUID(), albumJaipurId, everyoneId, riyaId]
  );

  // 4 cover mosaic photos for Jaipur trip
  const colors = [
    { title: 'Amer Fort Courtyard', color: '#15803d', sun: '#4ade80' },
    { title: 'Jal Mahal Mist', color: '#0d9488', sun: '#2dd4bf' },
    { title: 'Johari Bazaar Spices', color: '#0369a1', sun: '#38bdf8' },
    { title: 'Nahargarh Sunset', color: '#1e3a8a', sun: '#818cf8' },
  ];

  for (let idx = 0; idx < colors.length; idx++) {
    const albPostId = crypto.randomUUID();
    const c = colors[idx];
    const albSvg = createSvgDataUrl(c.title, 'Jaipur Trip Memory', c.color, c.sun, '📸');
    run(
      `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, created_at)
       VALUES (?, ?, ?, '2026-09-12T14:00:00Z', '2026-09-12T14:00:00Z', 'taken_at', 0, '2026-09-12T14:00:00Z')`,
      [albPostId, riyaId, c.title]
    );
    run(
      `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
       VALUES (?, ?, ?, 'photo', 0, ?, 110000, 'image/svg+xml', 1200, 600)`,
      [crypto.randomUUID(), albPostId, albSvg, albSvg]
    );
    run(
      `INSERT INTO album_items (album_id, post_id, position, added_at) VALUES (?, ?, ?, '2026-09-12T14:00:00Z')`,
      [albumJaipurId, albPostId, idx]
    );
  }

  // 5. Post 3: "Cricket nets" by Kabir in "Riya & Kabir" (7 Sept 2026)
  // Walkthrough: Kabir posted to Riya & Kabir. Riya shared to Aarav & Riya.
  // Because Kabir is the owner and hasn't approved it yet, Aarav sees a locked placeholder!
  const postCricketId = crypto.randomUUID();
  const svgCricket = createSvgDataUrl('Cricket nets', 'Weekend practice match under the lights', '#1f2937', '#e11d48', '🏏');
  run(
    `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, created_at)
     VALUES (?, ?, 'Cricket nets', '2026-09-07T16:00:00Z', '2026-09-07T16:00:00Z', 'taken_at', 1, '2026-09-07T16:00:00Z')`,
    [postCricketId, kabirId]
  );
  run(
    `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
     VALUES (?, ?, ?, 'photo', 0, ?, 115000, 'image/svg+xml', 1200, 600)`,
    [crypto.randomUUID(), postCricketId, svgCricket, svgCricket]
  );
  // Original placement in Riya & Kabir
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'post', ?, ?, ?, 0, 'approved', '2026-09-07T16:00:00Z')`,
    [crypto.randomUUID(), postCricketId, riyaKabirId, kabirId]
  );
  // Shared by Riya into "Aarav & Riya" as reference pending Kabir's approval
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'post', ?, ?, ?, 1, 'pending_owner_approval', '2026-09-07T16:30:00Z')`,
    [crypto.randomUUID(), postCricketId, aaravRiyaId, riyaId]
  );

  // 6. Post 4: "Late night chai" by Aarav in "Aarav & Riya" (3 Sept 2026)
  const postChaiId = crypto.randomUUID();
  const svgChai = createSvgDataUrl('Late night chai', 'Tapri by the station after work', '#1e293b', '#f59e0b', '☕');
  run(
    `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, created_at)
     VALUES (?, ?, 'Late night chai', '2026-09-03T23:15:00Z', '2026-09-03T23:15:00Z', 'taken_at', 1, '2026-09-03T23:15:00Z')`,
    [postChaiId, aaravId]
  );
  run(
    `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
     VALUES (?, ?, ?, 'photo', 0, ?, 105000, 'image/svg+xml', 1200, 600)`,
    [crypto.randomUUID(), postChaiId, svgChai, svgChai]
  );
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'post', ?, ?, ?, 0, 'approved', '2026-09-03T23:15:00Z')`,
    [crypto.randomUUID(), postChaiId, aaravRiyaId, aaravId]
  );

  // Weekend Hikers post & comment
  const hikerPostId = crypto.randomUUID();
  const hikerSvg = createSvgDataUrl('Mountain Ridge Trail', 'Elevation 2,500ft', '#1e1b4b', '#f43f5e', '🏔️');
  run(
    `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, created_at)
     VALUES (?, ?, 'Summit ridge hike', '2026-09-02T10:00:00Z', '2026-09-02T10:00:00Z', 'taken_at', 1, '2026-09-02T10:00:00Z')`,
    [hikerPostId, mayaId]
  );
  run(
    `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
     VALUES (?, ?, ?, 'photo', 0, ?, 105000, 'image/svg+xml', 1200, 600)`,
    [crypto.randomUUID(), hikerPostId, hikerSvg, hikerSvg]
  );
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'post', ?, ?, ?, 0, 'approved', '2026-09-02T10:00:00Z')`,
    [crypto.randomUUID(), hikerPostId, hikersId, mayaId]
  );
  run(
    `INSERT INTO comments (id, target_type, target_id, group_id, author_id, text, parent_id, created_at)
     VALUES (?, 'post', ?, ?, ?, 'Amazing view on the ridge!', NULL, '2026-09-02T11:00:00Z')`,
    [crypto.randomUUID(), hikerPostId, hikersId, leoId]
  );

  // Pending reference into Recipe Club by Leo (Maya's post referenced into Recipe Club)
  run(
    `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
     VALUES (?, 'post', ?, ?, ?, 1, 'pending_owner_approval', '2026-09-04T12:00:00Z')`,
    [crypto.randomUUID(), hikerPostId, recipeId, leoId]
  );

  saveDb();
  console.log('Kinfolk database seeded with prototype timeline data successfully!');
}
