import './check-node.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicEnvironmentProblems } from '../backend/env-boundary.mjs';
import { checkLocalReadiness } from './local-readiness.mjs';

const task = process.argv[2];
if (!['api-demo', 'web', 'preview', 'check', 'check-preview'].includes(task)) {
  console.error('Use npm run dev:local:api, dev:local:web, preview:local, check:local, or check:preview.');
  process.exit(1);
}
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

if (task.startsWith('check')) {
  const results = await checkLocalReadiness(task === 'check-preview' ? 18418 : 18417);
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}: HTTP ${result.status ?? 'unavailable'}, ${result.milliseconds} ms${result.error ? ', ' + result.error : ''}`);
  if (results.some(result => !result.ok)) {
    console.error('Demo preview is not ready. Check the two server terminals and retry; do not change a real database into demo mode to hide an error.');
    process.exitCode = 1;
  } else console.log(`Fictional demo ready: http://127.0.0.1:${task === 'check-preview' ? 18418 : 18417}/`);
} else {
  // Use the same mode-specific env resolution as Vite, without printing values.
  const { loadEnv } = await import('vite');
  const env = { ...loadEnv(task === 'preview' ? 'production' : 'development', process.cwd(), ''), ...process.env, API_PORT: '18787' };
  if (task === 'api-demo') Object.assign(env, { BACKEND_DATA_MODE: 'demo', ALLOW_DEMO_DATA: 'true' });
  const issues = publicEnvironmentProblems(env);
  if (issues.length) { issues.forEach(issue => console.error(issue)); process.exit(1); }
  if (task === 'preview' && !existsSync('dist/index.html')) {
    console.error('No production build found. Run npm run build before npm run preview:local.');
    process.exit(1);
  }
  const args = task === 'api-demo'
    ? ['--experimental-strip-types', 'backend/dev.ts', '--demo']
    : ['node_modules/vite/bin/vite.js', ...(task === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', task === 'preview' ? '18418' : '18417', '--strictPort'];
  console.log(task === 'api-demo' ? 'Starting explicitly fictional in-memory API on 127.0.0.1:18787.' : `Starting ${task} on 127.0.0.1:${task === 'preview' ? 18418 : 18417}; API proxy targets 18787.`);
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { console.error('Local server failed to start: ' + error.code); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
}
