import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
it('compares', () => { const repository = createRepository({ 'a.ts': '' }); expect(repository).toBeDefined(); });
function createRepository(files) {
  const root = mkdtempSync('/tmp/repo-');
  git(root, ['init', '-q', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Fixture']);
  commit(root, "base");
  return { root };
}
function commit(root, message) { git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', message]); }
function git(root, arguments_) { return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8' }); }