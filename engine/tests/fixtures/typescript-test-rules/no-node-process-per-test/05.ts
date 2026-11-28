import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
export function run(args) { return spawnSync(process.execPath, ['dist/main.js', ...args]); }