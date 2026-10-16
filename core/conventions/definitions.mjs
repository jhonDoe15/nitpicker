import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';
import { KOTLIN_CONVENTIONS } from '../../languages/java/conventions/kotlin-conventions.mjs';
import { PYTHON_CONVENTIONS } from '../../languages/python/conventions/python-conventions.mjs';
import { PRETTIER_CONVENTIONS } from '../../languages/typescript/conventions/prettier-conventions.mjs';

const BY_PRESET = new Map([
  ['typescript', PRETTIER_CONVENTIONS],
  ['javascript', PRETTIER_CONVENTIONS],
  ['java', JAVA_CONVENTIONS],
  ['kotlin', [...JAVA_CONVENTIONS, ...KOTLIN_CONVENTIONS]],
  ['python', PYTHON_CONVENTIONS],
]);

export function conventionDefinitions(preset = 'typescript') {
  return BY_PRESET.get(preset) ?? [];
}
