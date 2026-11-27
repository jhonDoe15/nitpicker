import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
import { cpSync } from 'node:fs';
beforeAll(() => { execFileSync('git', ['init', '-q', template]); });
it('copies the template', () => { cpSync(template, root, { recursive: true }); });