import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const sql = readFileSync(resolve(root, 'scripts/retention-summary.sql'), 'utf8').trim();
const wranglerBin = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const result = spawnSync(process.execPath, [
  wranglerBin,
  'd1',
  'execute',
  'living-plot-dev',
  '--remote',
  '--env',
  'development',
  '--config',
  'apps/api/wrangler.jsonc',
  '--command',
  sql,
], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Retention summary could not start.');
  process.exit(1);
}
process.exit(result.status ?? 1);
