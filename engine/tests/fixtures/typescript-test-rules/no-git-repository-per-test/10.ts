import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
it('inits', () => { execSync('git init -q repo'); });