import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';

const inputEmail = process.argv.find((value) => value.startsWith('--email='))?.slice('--email='.length)?.trim().toLowerCase();
const databaseUrl = process.env['DATABASE_URL'];

if (!databaseUrl) {
  console.error('Set DATABASE_URL to the local development database.');
  process.exit(1);
}
if (!inputEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail)) {
  console.error('Usage: npm run invite:member -- --email=person@example.com');
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
const digest = createHash('sha256').update(token).digest('hex');
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(
    `INSERT INTO member_invites (email, token_digest, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [inputEmail, digest],
  );
  console.log(`One-use invitation code for ${inputEmail} (expires in 7 days; share privately):`);
  console.log(token);
} finally {
  await pool.end();
}
