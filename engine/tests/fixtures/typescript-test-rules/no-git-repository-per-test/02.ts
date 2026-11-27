import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
function createTemplate() { execFileSync('git', ['init', '-q'], { cwd: template }); }
beforeAll(createTemplate);
it('reads status', () => { execFileSync('git', ['status'], { cwd: root }); });