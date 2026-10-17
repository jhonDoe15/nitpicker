import { childrenNamed, parseXml } from '../../ingest/common.mjs';

const CHECKSTYLE_DEFAULT_MAX = '80';

function moduleName(module) {
  return module.attrs.name
    .split('.')
    .at(-1)
    .replace(/Check$/u, '');
}

function allModules(root) {
  const found = [root];
  for (const module of found) {
    found.push(...childrenNamed(module, 'module'));
  }
  return found;
}

function parsed(text) {
  try {
    return { root: parseXml(text) };
  } catch (error) {
    return { failure: error.message };
  }
}

function property(module, name) {
  return childrenNamed(module, 'property').find(({ attrs }) => attrs.name === name)?.attrs.value;
}

function isActive(module) {
  return property(module, 'severity')?.trim().toLowerCase() !== 'ignore';
}

export function checkstyleLineLength(text) {
  const { root, failure } = parsed(text);
  if (root === undefined) {
    return { failure };
  }
  const module = allModules(root).find(
    (candidate) => moduleName(candidate) === 'LineLength' && isActive(candidate),
  );
  if (module === undefined) {
    return {};
  }
  const value = property(module, 'max') ?? CHECKSTYLE_DEFAULT_MAX;
  return /^\d+$/u.test(value) ? { max: value } : {};
}
