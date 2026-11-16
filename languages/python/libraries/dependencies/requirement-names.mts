import { listOf } from '../../../../shared/values/readers.mts';
import type { DependencyEntry } from '../typed/dependency-types.mts';

const DEV_WORDS = [
  'dev',
  'devel',
  'develop',
  'development',
  'test',
  'tests',
  'testing',
  'lint',
  'linting',
  'docs?',
  'typing',
  'types',
  'ci',
  'tox',
  'checks?',
  'qa',
  'format',
  'local',
  'style',
  'coverage',
];
const DEV_NAME = new RegExp(`(?:^|[-_.])(?:${DEV_WORDS.join('|')})(?:$|[-_.])`, 'u');
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/u;
const EGG_NAME = /[#&]egg=([A-Za-z0-9][A-Za-z0-9._-]*)/u;
const EDITABLE = /^-e(?:\s+|(?=\S))/u;
const URL_START = /^[a-z][a-z0-9+.-]*:\/\//iu;

export function normalizeRequirementName(name: string): string {
  return name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
}

export function requirementName(line: string): string | undefined {
  const text = line
    .replace(/\s+#.*$/u, '')
    .trim()
    .replace(EDITABLE, '');
  if (text === '' || text.startsWith('#') || text.startsWith('-')) {
    return undefined;
  }
  const egg = EGG_NAME.exec(text)?.[1];
  if (egg !== undefined) {
    return egg;
  }
  if (URL_START.test(text) || text.startsWith('.') || text.startsWith('/')) {
    return undefined;
  }
  return REQUIREMENT_NAME.exec(text)?.[1];
}

export function isDevelopmentGroup(name: unknown): boolean {
  return DEV_NAME.test(String(name).toLowerCase());
}

export function dependencyEntry(name: string, group: string, file: string): DependencyEntry {
  return { name, normalized: normalizeRequirementName(name), group, file };
}

export function requirementEntries(list: unknown, group: string, file: string): DependencyEntry[] {
  return listOf(list)
    .filter((line): line is string => typeof line === 'string')
    .map(requirementName)
    .filter((name) => name !== undefined)
    .map((name) => dependencyEntry(name, group, file));
}

export function groupOf(name: unknown, fallback: string): string {
  return isDevelopmentGroup(name) ? 'dev' : fallback;
}
