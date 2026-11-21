import path from 'node:path';
import { appendAll } from '../../../../shared/lists/lists.mts';
import { fieldOf, fieldsOf, isPlainObject, objectOf } from '../../../../shared/values/readers.mts';

type Pending = [unknown, string, readonly unknown[]];

const REGEXP_KEY = '$nitpickerRegExp';
const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'undefined']);
const KNIP_COMPILER_KEYS = new Set(['compilers', 'syncCompilers', 'asyncCompilers']);
const DEPENDENCY_CRUISER_FILE_OPTIONS = new Set(['webpackConfig', 'babelConfig']);

const DEPENDENCY_CRUISER_OWNED_OPTIONS = new Set([
  'baseDir',
  'cache',
  'collapse',
  'exclude',
  'extraExtensionsToScan',
  'focus',
  'focusDepth',
  'highlight',
  'includeOnly',
  'knownViolationsFile',
  'maxDepth',
  'metrics',
  'moduleSystems',
  'outputTo',
  'outputType',
  'prefix',
  'preserveSymlinks',
  'progress',
  'reaches',
  'reporterOptions',
  'ruleSet',
  'skipAnalysisNotInRules',
  'tsConfig',
  'tsPreCompilationDeps',
  'validate',
]);

export function isDependencyCruiserOwnedOption(key: string): boolean {
  return DEPENDENCY_CRUISER_OWNED_OPTIONS.has(key);
}

function isDataObject(value: unknown): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function described(value: unknown): string {
  if (typeof value !== 'object') {
    return `a ${typeof value}`;
  }
  const constructor: unknown = value === null ? undefined : Reflect.get(value, 'constructor');
  const name: unknown =
    typeof constructor === 'function' ? Reflect.get(constructor, 'name') : undefined;
  return typeof name === 'string' && name.length > 0 ? `a ${name}` : 'an object with a prototype';
}

function keyPath(where: string, key: string): string {
  return where === '' ? key : `${where}.${key}`;
}

function childrenOf(value: object, where: string, ancestors: readonly unknown[]): Pending[] {
  const lineage = [...ancestors, value];
  return Array.isArray(value)
    ? value.map((item: unknown, index): Pending => [item, `${where}[${String(index)}]`, lineage])
    : Object.entries(value).map(([key, item]): Pending => [item, keyPath(where, key), lineage]);
}

function unsupportedValue(value: unknown): { where: string; what: string } | undefined {
  const pending: Pending[] = [[value, '', []]];
  for (const [item, where, ancestors] of pending) {
    const scalar = item === null || SCALAR_TYPES.has(typeof item) || item instanceof RegExp;
    const circular = !scalar && ancestors.includes(item);
    if (circular || !(scalar || Array.isArray(item) || isDataObject(item))) {
      return { where, what: circular ? 'a circular reference' : described(item) };
    }
    const container = scalar ? undefined : objectOf(item);
    if (container !== undefined) {
      appendAll(pending, childrenOf(container, where, ancestors));
    }
  }
  return undefined;
}

export function encodedValue(value: unknown, at?: string): unknown {
  const unsupported = unsupportedValue(value);
  if (unsupported !== undefined) {
    const where = unsupported.where === '' ? 'the exported value' : unsupported.where;
    const label = at === undefined ? '' : `${at}: `;
    throw new TypeError(
      `${label}${where} is ${unsupported.what}; only JSON values and regular expressions can be used`,
    );
  }
  const encoded: unknown = JSON.parse(
    JSON.stringify(value, (_key: string, item: unknown) =>
      item instanceof RegExp ? { [REGEXP_KEY]: [item.source, item.flags] } : item,
    ),
  );
  return encoded;
}

export function patternSource(pattern: unknown): unknown {
  if (pattern instanceof RegExp) {
    return pattern.source;
  }
  const tagged = fieldOf(pattern, REGEXP_KEY);
  return Array.isArray(tagged) ? tagged[0] : pattern;
}

export function hasEncodedRegExp(value: unknown): boolean {
  return JSON.stringify(value).includes(JSON.stringify(REGEXP_KEY));
}

export function revivedExpression(value: unknown): string {
  const key = JSON.stringify(REGEXP_KEY);
  const reviver = `(_key, item) => Array.isArray(item?.[${key}]) ? new RegExp(...item[${key}]) : item`;
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))}, ${reviver})`;
}

function withoutKeys(config: object, keys: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !keys.has(key)));
}

export function withoutKnipCompilers(config: unknown): unknown {
  if (!isPlainObject(config)) {
    return config;
  }
  const root = withoutKeys(config, KNIP_COMPILER_KEYS);
  const rootWorkspaces = fieldOf(root, 'workspaces');
  if (!isPlainObject(rootWorkspaces)) {
    return root;
  }
  const workspaces = Object.entries(rootWorkspaces).map(([name, workspace]): [string, unknown] => [
    name,
    isPlainObject(workspace) ? withoutKeys(workspace, KNIP_COMPILER_KEYS) : workspace,
  ]);
  return { ...root, workspaces: Object.fromEntries(workspaces) };
}

export function withDependencyCruiserFiles(config: unknown, root: string): unknown {
  const configured = fieldOf(config, 'options');
  if (!(isPlainObject(config) && isPlainObject(configured))) {
    return config;
  }
  const options = Object.entries(configured).map(([key, value]): [string, unknown] => {
    const fileName = fieldOf(value, 'fileName');
    return DEPENDENCY_CRUISER_FILE_OPTIONS.has(key) && typeof fileName === 'string'
      ? [key, { ...fieldsOf(value), fileName: path.resolve(root, fileName) }]
      : [key, value];
  });
  return { ...config, options: Object.fromEntries(options) };
}
