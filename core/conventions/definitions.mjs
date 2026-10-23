import { jscpdIgnoredNotices } from '../tooling/jscpd/config.mjs';
import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';
import { KOTLIN_CONVENTIONS } from '../../languages/java/conventions/kotlin-conventions.mjs';
import { javaProjectStyle } from '../../languages/java/conventions/java-project-style.mjs';
import { kotlinStyle } from '../../languages/java/conventions/kotlin-style.mjs';
import { PYTHON_CONVENTIONS } from '../../languages/python/conventions/python-conventions.mjs';
import { pythonStyle } from '../../languages/python/conventions/python-style.mjs';
import {
  JAVASCRIPT_CONVENTIONS,
  TYPESCRIPT_CONVENTIONS,
} from '../../languages/typescript/conventions/typescript-conventions.mjs';

const BY_PRESET = new Map([
  ['typescript', TYPESCRIPT_CONVENTIONS],
  ['javascript', JAVASCRIPT_CONVENTIONS],
  ['java', JAVA_CONVENTIONS],
  ['kotlin', [...JAVA_CONVENTIONS, ...KOTLIN_CONVENTIONS]],
  ['python', PYTHON_CONVENTIONS],
]);

export function conventionDefinitions(preset = 'typescript') {
  return BY_PRESET.get(preset) ?? [];
}

function jscpdStyle({ config, projectRoot }) {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => jscpdIgnoredNotices(config, projectRoot),
  };
}

const STYLES_BY_PRESET = new Map([
  ['typescript', [jscpdStyle]],
  ['javascript', [jscpdStyle]],
  ['java', [javaProjectStyle, jscpdStyle]],
  ['kotlin', [javaProjectStyle, kotlinStyle, jscpdStyle]],
  ['python', [pythonStyle, jscpdStyle]],
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
  const styles = STYLES_BY_PRESET.get(preset ?? 'typescript')?.map((style) => style(context));
  return styles === undefined ? NO_STYLE : mergedStyle(styles);
}
