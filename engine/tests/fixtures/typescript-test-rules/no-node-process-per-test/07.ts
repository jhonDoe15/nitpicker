import { execFileSync } from 'node:child_process';
function runWithPolicy(arguments_, policy) { return JSON.parse(execFileSync(process.execPath, arguments_, { encoding: 'utf8' })); }
function importDefault(relativePath, policy) { return runWithPolicy(['--input-type=module', '-e', relativePath], policy); }
it('reads the policy', () => { expect(importDefault('a.mjs', {})).toEqual({}); });