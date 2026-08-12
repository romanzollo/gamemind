/**
 * Import TEXT draft batches to prod Neon without printing secrets.
 * Sets DATABASE_URL_UNPOOLED from PROD_DATABASE_URL_UNPOOLED for child process.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const env = { ...process.env };
  for (const fileName of ['.env', '.env.local']) {
    const filePath = path.join(ROOT, fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in env)) env[key] = value;
    }
  }
  return env;
}

const env = loadEnv();
const prodUrl = env.PROD_DATABASE_URL_UNPOOLED || env.PROD_DATABASE_URL;
if (!prodUrl) {
  console.error('Missing PROD_DATABASE_URL_UNPOOLED');
  process.exit(1);
}
let host;
try {
  host = new URL(prodUrl).hostname;
} catch {
  console.error('Bad PROD URL');
  process.exit(1);
}
if (host.includes('jolly-river')) {
  console.error('Refusing: prod URL looks like local jolly-river');
  process.exit(1);
}

env.DATABASE_URL_UNPOOLED = prodUrl;
env.DATABASE_URL = prodUrl;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/import-text-drafts-to-prod.cjs <files...> [--dry-run]');
  process.exit(1);
}

console.log('TEXT import target host:', host);
for (const file of files.filter((f) => !f.startsWith('--'))) {
  const args = ['run', 'content:import-drafts', '--', file];
  if (files.includes('--dry-run')) args.push('--dry-run');
  console.log('→', file);
  const result = spawnSync('npm', args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    shell: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error('Failed on', file, 'exit', result.status);
    process.exit(result.status || 1);
  }
}
console.log('TEXT prod import finished.');
