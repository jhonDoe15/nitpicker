import { childrenNamed } from '../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import { parsedXml } from './declarations/parsed-xml.mts';
import { appendAll } from '../../../../shared/lists/items.mjs';

const CHECKSTYLE_DEFAULT_MAX = '80';

function moduleName(module: XmlElement): string {
  return (
    (module.attrs['name'] ?? '')
      .split('.')
      .at(-1)
      ?.replace(/Check$/u, '') ?? ''
  );
}

function allModules(root: XmlElement): XmlElement[] {
  const found = [root];
  for (const module of found) {
    appendAll(found, childrenNamed(module, 'module'));
  }
  return found;
}

function property(module: XmlElement, name: string): string | undefined {
  return childrenNamed(module, 'property').find(({ attrs }) => attrs['name'] === name)?.attrs[
    'value'
  ];
}

function isActive(module: XmlElement): boolean {
  return property(module, 'severity')?.trim().toLowerCase() !== 'ignore';
}

export function checkstyleLineLength(text: string): { max?: string; failure?: string | undefined } {
  const { root, failure } = parsedXml(text);
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
