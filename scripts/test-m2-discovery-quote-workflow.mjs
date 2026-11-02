import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const workflow = join(root, 'test-m1-fixture-workflow.mjs');
const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [workflow], { cwd: join(root, '..'), env: process.env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
if (result.signal || result.code !== 0) process.exit(result.code ?? 1);
console.log('M2 PostgreSQL acceptance passed: ranked discovery deduplication and owner isolation, quote evidence/arithmetic/hash validation, read-only approval, concurrent decision fencing, expiry sweep and amendment invalidation, watch match/no-match continuation, notify-only boundaries, and soft-threshold routing.');
