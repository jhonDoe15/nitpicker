import { existsSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../../../shared/rules/facts/checks.mjs';

function aliasEntries(alias) {
  if (Array.isArray(alias)) return alias.filter(isRecord);
  return isRecord(alias)
    ? Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
    : [];
}

function serializedFind(find) {
  if (typeof find === 'string') return find;
  return find instanceof RegExp ? { pattern: find.source, flags: find.flags } : undefined;
}

function fileSystemReplacement(replacement, projectRoot) {
  if (replacement.startsWith('/')) {
    const rooted = path.join(projectRoot, replacement);
    return existsSync(rooted) ? rooted : replacement;
  }
  return replacement.startsWith('.') ? path.resolve(projectRoot, replacement) : replacement;
}

export function aliasesFromConfig(config, projectRoot) {
  const configured = isRecord(config) ? config : {};
  const resolveOptions = isRecord(configured.resolve) ? configured.resolve : {};
  const testOptions = isRecord(configured.test) ? configured.test : {};
  return [resolveOptions.alias, testOptions.alias]
    .flatMap(aliasEntries)
    .filter(({ find, replacement }) => serializedFind(find) && typeof replacement === 'string')
    .map(({ find, replacement }) => ({
      find: serializedFind(find),
      replacement: fileSystemReplacement(replacement, projectRoot),
    }));
}
