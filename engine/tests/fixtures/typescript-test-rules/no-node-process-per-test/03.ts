import { execFileSync, execSync, spawnSync, fork } from 'node:child_process';
let output;
beforeAll(() => { output = spawnSync(process.execPath, [cli, '--all']); });
it('prints a summary', () => { expect(String(output.stdout)).toContain('0'); });