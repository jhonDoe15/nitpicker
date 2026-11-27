import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
afterEach(() => { execFileSync('git', ['init', '-q']); });