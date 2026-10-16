import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';
import { KOTLIN_CONVENTIONS } from '../../languages/java/conventions/kotlin-conventions.mjs';
import { kotlinStyle } from '../../languages/java/conventions/kotlin-style.mjs';
import { PYTHON_CONVENTIONS } from '../../languages/python/conventions/python-conventions.mjs';
import { pythonStyle } from '../../languages/python/conventions/python-style.mjs';
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

const STYLE_BY_PRESET = new Map([
  ['kotlin', kotlinStyle],
  ['python', pythonStyle],
]);
const NO_STYLE = { unused: {}, project: {}, note: () => undefined };

export function conventionStyle(preset, context) {
  const style = STYLE_BY_PRESET.get(preset);
  return style === undefined ? NO_STYLE : style(context);
}
