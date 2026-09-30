import { seedDatabase } from '../server/seed.ts';

async function main() {
  console.log('Running Kinfolk seed script...');
  await seedDatabase(true);
  console.log('Seed completed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
