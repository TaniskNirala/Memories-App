import { getDb } from './db.ts';

export const TANISK_ID = 'f2bc3e7f-d7a1-4a8b-b789-282c9c8eb4a3';
export const EVERYONE_GROUP_ID = '56896808-0e5c-4303-b413-98b0eb3ad540';

// No automatic test data seeding or photo syncing
export async function seedDatabase(_force: boolean = false): Promise<void> {
  await getDb();
}
