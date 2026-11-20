import type { JscpdConfig, KnipConfig, Tsconfig } from './tool-config-types.mts';

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function hasLists(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    names.every((name) => isStringList(Reflect.get(value, name)))
  );
}

export function tsconfigOf(value: unknown): Tsconfig {
  if (!hasLists(value, ['include', 'exclude'])) {
    throw new TypeError('A tsconfig policy file needs include and exclude lists');
  }
  return { ...value, include: textList(value['include']), exclude: textList(value['exclude']) };
}

export function knipConfigOf(value: unknown): KnipConfig {
  if (!hasLists(value, ['entry', 'project', 'ignore'])) {
    throw new TypeError('A knip policy file needs entry, project and ignore lists');
  }
  return {
    ...value,
    entry: textList(value['entry']),
    project: textList(value['project']),
    ignore: textList(value['ignore']),
  };
}

export function jscpdConfigOf(value: unknown): JscpdConfig {
  if (!hasLists(value, ['path', 'ignore'])) {
    throw new TypeError('A jscpd policy file needs path and ignore lists');
  }
  return {
    ...value,
    format: textList(value['format']),
    path: textList(value['path']),
    ignore: textList(value['ignore']),
  };
}

function textList(value: unknown): readonly string[] {
  return isStringList(value) ? value : [];
}
