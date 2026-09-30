// Keep this entry point compatible with older Node versions so npm commands can
// find an already installed modern runtime before loading the ES modules.
const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { homedir } = require('os');
const { resolve, delimiter } = require('path');

const commands = {
  build: ['scripts/build.mjs'],
  export: ['scripts/build.mjs', '--export'],
  check: ['scripts/build.mjs', '--check'],
  dev: ['scripts/dev.mjs'],
  test: ['--test'],
};
const args = commands[process.argv[2]];
if (!args) {
  console.error('Use build, export, check, dev or test.');
  process.exit(1);
}

const candidates = process.env.SITE_NODE ? [process.env.SITE_NODE] : [
  process.execPath,
  ...(process.env.PATH || '').split(delimiter).filter(Boolean).map(dir => resolve(dir, process.platform === 'win32' ? 'node.exe' : 'node')),
  resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'),
];
let runtime;
for (const candidate of new Set(candidates)) {
  if (!existsSync(candidate)) continue;
  const version = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
  if (version.status === 0 && Number(version.stdout.trim().replace(/^v/, '').split('.')[0]) >= 22) {
    runtime = candidate;
    break;
  }
}
if (!runtime) {
  console.error(`Current Node.js: ${process.version}. This project requires Node.js 22+. Switch Node versions or set SITE_NODE to an installed Node.js 22+ executable.`);
  process.exit(1);
}
if (runtime !== process.execPath) console.log(`Using Node.js: ${runtime}`);
const result = spawnSync(runtime, [...args, ...process.argv.slice(3)], { cwd: resolve(__dirname, '..'), stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status === null ? 1 : result.status;
