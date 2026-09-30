import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { logger } from '../config/logger.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';

/**
 * Create the initial SUPER_ADMIN from env. Idempotent — skips if the email
 * already exists. Run with: npm run seed:admin --workspace @taaj/backend
 *
 * Required env: SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
async function run() {
  const name = process.env.SEED_ADMIN_NAME;
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      'Set SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding.',
    );
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
  }

  await connectDatabase();

  const existing = await User.findOne({ email });
  if (existing) {
    logger.info({ email }, 'Super admin already exists — nothing to do');
  } else {
    await User.create({
      name,
      email,
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(password),
    });
    logger.info({ email }, '✅ Super admin created');
  }

  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error({ err }, 'Seed failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
