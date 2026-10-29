import { isPlainObject, listOf } from '../../../../shared/config.mjs';

const REGEXP_KEY = '$nitpickerRegExp';
const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'undefined']);
const KNIP_COMPILER_KEYS = new Set(['compilers', 'syncCompilers', 'asyncCompilers']);

function isDataObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function described(value) {
  if (typeof value !== 'object') {
    return `a ${typeof value}`;
  }
  const name = value.constructor?.name;
  return typeof name === 'string' && name.length > 0 ? `a ${name}` : 'an object with a prototype';
}

function childrenOf(value, where, ancestors) {
  const at = (key) => (where === '' ? key : `${where}.${key}`);
  const lineage = [...ancestors, value];
  return Array.isArray(value)
    ? value.map((item, index) => [item, `${where}[${String(index)}]`, lineage])
    : Object.entries(value).map(([key, item]) => [item, at(key), lineage]);
}

function unsupportedValue(value) {
  const pending = [[value, '', []]];
  for (const [item, where, ancestors] of pending) {
    const scalar = item === null || SCALAR_TYPES.has(typeof item) || item instanceof RegExp;
    const circular = !scalar && ancestors.includes(item);
    if (circular || (!scalar && !Array.isArray(item) && !isDataObject(item))) {
      return { where, what: circular ? 'a circular reference' : described(item) };
    }
    if (!scalar) {
      pending.push(...childrenOf(item, where, ancestors));
    }
  }
  return undefined;
}

export function encodedValue(value, at = 'config') {
  const unsupported = unsupportedValue(value);
  if (unsupported !== undefined) {
    const where = unsupported.where === '' ? 'the exported value' : unsupported.where;
    throw new TypeError(
      `${at}: ${where} is ${unsupported.what}; only JSON values and regular expressions can be used`,
    );
  }
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      item instanceof RegExp ? { [REGEXP_KEY]: [item.source, item.flags] } : item,
    ),
  );
}

export function hasEncodedRegExp(value) {
  return JSON.stringify(value).includes(JSON.stringify(REGEXP_KEY));
}

export function revivedExpression(value) {
  const key = JSON.stringify(REGEXP_KEY);
  const reviver = `(_key, item) => Array.isArray(item?.[${key}]) ? new RegExp(...item[${key}]) : item`;
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))}, ${reviver})`;
}

export function shownValue(value) {
  if (value === undefined) {
    return 'not set';
  }
  return JSON.stringify(value, (_key, item) =>
    Array.isArray(item?.[REGEXP_KEY]) ? `/${item[REGEXP_KEY][0]}/${item[REGEXP_KEY][1]}` : item,
  );
}

function withoutKeys(config, keys) {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !keys.has(key)));
}

export function withoutKnipCompilers(config) {
  if (!isPlainObject(config)) {
    return config;
  }
  const root = withoutKeys(config, KNIP_COMPILER_KEYS);
  if (!isPlainObject(root.workspaces)) {
    return root;
  }
  const workspaces = Object.entries(root.workspaces).map(([name, workspace]) => [
    name,
    isPlainObject(workspace) ? withoutKeys(workspace, KNIP_COMPILER_KEYS) : workspace,
  ]);
  return { ...root, workspaces: Object.fromEntries(workspaces) };
}
