import * as cp from 'node:child_process';
it.each([1, 2])('case %s', () => { cp.spawnSync('git', ['-C', root, 'clone', source]); });