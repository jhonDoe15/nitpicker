// Writes what the Node checks report for the typed fixtures, for `tests/typescript_typed.rs`.
// Run from the repository root: node engine/parity/typescript-typed-expected.mts
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyzePublicContractUsage } from '../../languages/typescript/preset/architecture/public-contract-usage.mts';

const engine = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(engine, 'tests/fixtures/typescript-typed');
const expected: Record<string, unknown> = {};
for (const name of readdirSync(fixtures).sort()) {
  const project = path.join(fixtures, name);
  process.chdir(project);
  const findings = analyzePublicContractUsage(path.join(project, 'tsconfig.json'));
  expected[name] = { 'public-contracts': [...findings].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)) };
}
writeFileSync(path.join(engine, 'tests/expected/typescript-typed.json'), `${JSON.stringify(expected, null, 2)}\n`);
