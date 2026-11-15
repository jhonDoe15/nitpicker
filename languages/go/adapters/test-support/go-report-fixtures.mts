import type { GoDefinition, GoFile, GoUsage } from '../go-types.mts';

const PARENT_DIRECTORY = -2;

export function reportFile(path: string, extra: Partial<GoFile> = {}): GoFile {
  return {
    path,
    package: extra.package ?? path.split('/').at(PARENT_DIRECTORY) ?? 'root',
    test: path.endsWith('_test.go'),
    generated: false,
    constrained: false,
    ...extra,
  };
}

export function reportDefinition(
  path: string,
  name: string,
  extra: Partial<GoDefinition> = {},
): GoDefinition {
  return {
    file: path,
    name,
    kind: 'function',
    line: 3,
    lines: 3,
    exported: /^[A-Z]/u.test(name),
    entry: false,
    literal: false,
    tokens: ['func', name],
    ...extra,
  };
}

export function reportUsage(path: string, extra: Partial<GoUsage> = {}): GoUsage {
  return { file: path, imports: [], names: [], selectors: [], local: [], ...extra };
}
