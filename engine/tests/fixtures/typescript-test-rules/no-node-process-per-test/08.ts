import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
it('lints', () => { execFileSync(path.join(root, 'node_modules/.bin/eslint'), ['.']); });
it('compiles', () => { execSync('npx tsc --noEmit'); });
beforeEach(() => { fork('./worker.js'); });
test('runs', () => { const node = 'node'; spawnSync(node, ['main.js']); });