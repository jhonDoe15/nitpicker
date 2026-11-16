import path from 'node:path';
import { readLayout } from '../rules/typed/policy-views.mts';

const layout = readLayout();

export function productionModulePath(specifier: unknown, filename: string): string | undefined {
  if (typeof specifier !== 'string') {
    return undefined;
  }
  const resolved = specifier.startsWith('.')
    ? path.resolve(path.dirname(filename), specifier).replaceAll('\\', '/')
    : specifier;
  const sourceRoot = layout.sourceRootOf(resolved);
  if (sourceRoot === undefined) {
    return undefined;
  }
  const projectRelative = resolved.slice(resolved.indexOf(`/${sourceRoot}/`) + 1);
  return layout.isTestFile(projectRelative) ? undefined : resolved;
}
