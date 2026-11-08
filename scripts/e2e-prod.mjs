// Runs the Playwright suite against the deployed site (no local server).
// Usage: npm run test:e2e:prod            -> https://menuempauqe.netlify.app
//        BASE_URL=https://other npm run test:e2e:prod
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseUrl = process.env.BASE_URL ?? 'https://menuempauqe.netlify.app';
const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BASE_URL: baseUrl },
});
process.exit(result.status ?? 1);
