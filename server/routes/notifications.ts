import { Router } from 'express';
import { queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';
import type { Row } from '../rows.ts';

export const notificationsRouter = Router();
notificationsRouter.use(requireApproved);

notificationsRouter.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const notifs = queryAll<Row>(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  const unreadCount = notifs.filter((n) => !n.read).length;
  res.json({ notifications: notifs, unreadCount });
});

notificationsRouter.post('/mark-all-read', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [userId]);
  res.json({ success: true });
});

notificationsRouter.post('/:id/read', (req: AuthenticatedRequest, res) => {
  const notifId = req.params.id;
  const userId = req.user!.id;
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [notifId, userId]);
  res.json({ success: true });
});
