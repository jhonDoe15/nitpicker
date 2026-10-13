import { jvmImportsOnly } from './import-only/jvm-imports.mjs';
import { pythonImportsOnly } from './import-only/python-imports.mjs';
import { scriptImportsOnly } from './import-only/script-imports.mjs';

const CHECKS = new Map([
  ['python', pythonImportsOnly],
  ['java', jvmImportsOnly],
  ['kotlin', jvmImportsOnly],
  ['typescript', scriptImportsOnly],
  ['tsx', scriptImportsOnly],
  ['javascript', scriptImportsOnly],
]);

export function importsOnly(fragment, format) {
  const check = CHECKS.get(format);
  if (check === undefined) {
    throw new TypeError(`No import detection for jscpd format "${format}"`);
  }
  const lines = fragment.split('\n');
  return check(lines.length > 1 ? lines.slice(0, -1).join('\n') : fragment);
}

export function withoutImportOnlyClones(clones, format) {
  return clones.filter(
    (clone) => clone.fragment === undefined || !importsOnly(clone.fragment, format),
  );
}
