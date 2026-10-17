import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';
import { KOTLIN_CONVENTIONS } from '../../languages/java/conventions/kotlin-conventions.mjs';
import { javaProjectStyle } from '../../languages/java/conventions/java-project-style.mjs';
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

const STYLES_BY_PRESET = new Map([
  ['java', [javaProjectStyle]],
  ['kotlin', [javaProjectStyle, kotlinStyle]],
  ['python', [pythonStyle]],
]);
const NO_STYLE = { unused: {}, project: {}, note: () => undefined };

function mergedStyle(styles) {
  const derivers = styles.map(({ derive }) => derive).filter(Boolean);
  return {
    unused: Object.assign({}, ...styles.map(({ unused }) => unused)),
    project: Object.assign({}, ...styles.map(({ project }) => project)),
    note: (id, choice) => styles.map(({ note }) => note(id, choice)).find(Boolean),
    summary: (conventions) => styles.flatMap(({ summary }) => summary?.(conventions) ?? []),
    derive: (detected) => Object.assign({}, ...derivers.map((derive) => derive(detected))),
  };
}

export function conventionStyle(preset, context) {
  const styles = STYLES_BY_PRESET.get(preset)?.map((style) => style(context));
  return styles === undefined ? NO_STYLE : mergedStyle(styles);
}
