import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
function checked(root, command, args) { return execFileSync(command, args, { cwd: root, encoding: 'utf8' }); }
beforeEach(() => { checked(root, 'git', ['init', '-b', 'main']); });