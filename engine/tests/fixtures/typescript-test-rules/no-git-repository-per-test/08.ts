import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
function git(root, ...args) { execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', ...args], { cwd: root }); }
function createProject() { const root = mkdtempSync('/tmp/x-'); git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '-A'); return root; }
it('passes', () => { runSnapshot(createProject()); });