import { COLUMNS } from '../../../../shared/conventions/settings.mjs';
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

export function checkstyleLineLength(text) {
  const { root } = parsed(text);
  const module =
    root === undefined
      ? undefined
      : allModules(root).find((candidate) => moduleName(candidate) === 'LineLength');
  if (module === undefined) {
    return undefined;
  }
  const max = childrenNamed(module, 'property').find(({ attrs }) => attrs.name === 'max');
  const value = max === undefined ? CHECKSTYLE_DEFAULT_MAX : max.attrs.value;
  return COLUMNS.valuePattern.test(value) ? value : undefined;
}
