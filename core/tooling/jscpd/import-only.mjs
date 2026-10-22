import { JVM_OVERSHOOT, jvmImportsOnly } from './import-only/jvm-imports.mjs';
import { PYTHON_OVERSHOOT, pythonImportsOnly } from './import-only/python-imports.mjs';
import { SCRIPT_OVERSHOOT, scriptImportsOnly } from './import-only/script-imports.mjs';

const CHECKS = new Map([
  ['python', { check: pythonImportsOnly, overshoot: PYTHON_OVERSHOOT }],
  ['java', { check: jvmImportsOnly, overshoot: JVM_OVERSHOOT }],
  ['kotlin', { check: jvmImportsOnly, overshoot: JVM_OVERSHOOT }],
  ['typescript', { check: scriptImportsOnly, overshoot: SCRIPT_OVERSHOOT }],
  ['tsx', { check: scriptImportsOnly, overshoot: SCRIPT_OVERSHOOT }],
  ['javascript', { check: scriptImportsOnly, overshoot: SCRIPT_OVERSHOOT }],
]);

export function importsOnly(fragment, format) {
  const language = CHECKS.get(format);
  if (language === undefined) {
    throw new TypeError(`No import detection for jscpd format "${format}"`);
  }
  const text = fragment.trimEnd();
  if (language.check(text)) {
    return true;
  }
  const lines = text.split('\n');
  return (
    lines.length > 1 &&
    language.overshoot.test(lines.at(-1)) &&
    language.check(lines.slice(0, -1).join('\n'))
  );
}

export function withoutImportOnlyClones(clones, format) {
  return clones.filter(
    (clone) => clone.fragment === undefined || !importsOnly(clone.fragment, format),
  );
}
