import { existsSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject as isRecord, listOf } from '../../../../shared/values/readers.mts';
import type { EnvironmentAlias } from './typed/environment-types.mts';

function aliasEntries(alias: unknown): Record<string, unknown>[] {
  if (Array.isArray(alias)) {
    return listOf(alias).filter(isRecord);
  }
  return isRecord(alias)
    ? Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
    : [];
}

function serializedFind(find: unknown): EnvironmentAlias['find'] | undefined {
  if (typeof find === 'string') {
    return find;
  }
  return find instanceof RegExp ? { pattern: find.source, flags: find.flags } : undefined;
}

function fileSystemReplacement(replacement: string, projectRoot: string): string {
  if (replacement.startsWith('/')) {
    const rooted = path.join(projectRoot, replacement);
    if (!rooted.startsWith(`${projectRoot}${path.sep}`)) {
      return replacement;
    }
    return existsSync(rooted) ? rooted : replacement;
  }
  return replacement.startsWith('.') ? path.resolve(projectRoot, replacement) : replacement;
}

export function aliasesFromConfig(config: unknown, projectRoot: string): EnvironmentAlias[] {
  const configured = isRecord(config) ? config : {};
  const resolveOptions = isRecord(configured['resolve']) ? configured['resolve'] : {};
  const testOptions = isRecord(configured['test']) ? configured['test'] : {};
  return [resolveOptions['alias'], testOptions['alias']]
    .flatMap(aliasEntries)
    .flatMap(({ find, replacement }) => {
      const serialized = serializedFind(find);
      return serialized !== undefined && serialized !== '' && typeof replacement === 'string'
        ? [{ find: serialized, replacement: fileSystemReplacement(replacement, projectRoot) }]
        : [];
    });
}
