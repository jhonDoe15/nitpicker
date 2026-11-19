import { GO_OVERSHOOT, goImportsOnly } from './import-only/go-imports.mts';
import { JVM_OVERSHOOT, jvmImportsOnly } from './import-only/jvm-imports.mts';
import { PYTHON_OVERSHOOT, pythonImportsOnly } from './import-only/python-imports.mts';
import { SCRIPT_OVERSHOOT, scriptImportsOnly } from './import-only/script-imports.mts';

type Language = { check: (fragment: string) => boolean; overshoot: RegExp };

const CHECKS = new Map<string, Language>([
  ['python', { check: pythonImportsOnly, overshoot: PYTHON_OVERSHOOT }],
  ['java', { check: jvmImportsOnly, overshoot: JVM_OVERSHOOT }],
  ['kotlin', { check: jvmImportsOnly, overshoot: JVM_OVERSHOOT }],
  ['typescript', { check: scriptImportsOnly, overshoot: SCRIPT_OVERSHOOT }],
  ['tsx', { check: scriptImportsOnly, overshoot: SCRIPT_OVERSHOOT }],
  ['javascript', { check: scriptImportsOnly, overshoot: SCRIPT_OVERSHOOT }],
  ['go', { check: goImportsOnly, overshoot: GO_OVERSHOOT }],
]);

export function importsOnly(fragment: string, format: string): boolean {
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
    language.overshoot.test(lines.at(-1) ?? '') &&
    language.check(lines.slice(0, -1).join('\n'))
  );
}

export function withoutImportOnlyClones<Clone extends Readonly<Record<string, unknown>>>(
  clones: readonly Clone[],
  format: string,
): Clone[] {
  return clones.filter(
    (clone) => typeof clone['fragment'] !== 'string' || !importsOnly(clone['fragment'], format),
  );
}
