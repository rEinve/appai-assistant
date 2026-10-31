import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('Set DATABASE_URL in the local environment or .env file.');
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(scriptDir, '..', 'packages', 'persistence', 'migrations');
const migrationFiles = (await readdir(migrationDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  for (const file of migrationFiles) {
    const sql = await readFile(join(migrationDir, file), 'utf8');
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }
} finally {
  await pool.end();
}
