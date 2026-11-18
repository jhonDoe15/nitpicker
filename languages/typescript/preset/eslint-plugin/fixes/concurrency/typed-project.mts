import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { typedCases } from '../../test-support/typed-cases.mts';

export function typedProject(prefix: string, manifest: Readonly<Record<string, unknown>>) {
  const cases = typedCases(prefix);
  const root = path.dirname(path.dirname(cases.typed('').filename));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  return cases;
}
