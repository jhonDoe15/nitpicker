import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
it('reads real git output', () => {
  const run = (...args) => execFileSync('git', ['-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' }).trim();
  run('init', '-q', '-b', 'main');
  run('commit', '-q', '-m', 'base');
});