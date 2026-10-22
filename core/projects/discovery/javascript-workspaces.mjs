import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { isNonEmptyString } from '../../../shared/config.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';

const MANIFEST_ORIGIN = 'package.json workspaces';
const PNPM_ORIGIN = 'pnpm-workspace.yaml';

function readText(file, parse) {
  if (!existsSync(file)) {
    return { value: undefined };
  }
  try {
    return { value: parse(readFileSync(file, 'utf8')) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

function stringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function manifestPatterns(root) {
  const workspaces = readText(path.join(root, 'package.json'), JSON.parse).value?.workspaces;
  return stringList(Array.isArray(workspaces) ? workspaces : workspaces?.packages);
}

function pnpmPatterns(root) {
  return stringList(readText(path.join(root, 'pnpm-workspace.yaml'), parseYaml).value?.packages);
}

function folderPattern(pattern) {
  return pattern.replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function matchersOf(patterns) {
  return patterns.map((pattern) => globMatcher(folderPattern(pattern)));
}

export function workspaceMembers(patterns, directories) {
  const included = matchersOf(patterns.filter((pattern) => !pattern.startsWith('!')));
  const excluded = matchersOf(
    patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1)),
  );
  return directories.filter(
    (directory) =>
      directory !== '.' &&
      included.some((matcher) => matcher.test(directory)) &&
      !excluded.some((matcher) => matcher.test(directory)),
  );
}

export function javascriptWorkspaces(root, packageDirectories) {
  const sources = [
    [PNPM_ORIGIN, pnpmPatterns(root)],
    [MANIFEST_ORIGIN, manifestPatterns(root)],
  ].filter(([, patterns]) => patterns.length > 0);
  const members = new Map();
  for (const [origin, patterns] of sources) {
    for (const directory of workspaceMembers(patterns, packageDirectories)) {
      members.set(directory, members.get(directory) ?? origin);
    }
  }
  return {
    declared: sources.length > 0,
    members: [...members].map(([directory, origin]) => ({ path: directory, origin })),
  };
}
