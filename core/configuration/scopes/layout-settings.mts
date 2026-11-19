import path from 'node:path';
import {
  configError,
  DRIVE_LETTER,
  FEATURE_LAYOUT_KEYS,
  GLOB_CHARACTER,
  PARENT_SEGMENT,
  validateFolderGlobs,
  validateStringArray,
} from '../../../shared/config.mjs';
import { factRuleSettings, isPlainObject } from '../views/config-views.mts';
import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import { didYouMean } from '../../../shared/messages/closest-match.mjs';

export const TYPESCRIPT_PRESETS: readonly (string | undefined)[] = [
  undefined,
  'typescript',
  'javascript',
];

export const LAYOUT_KEYS = [
  'sourceRoots',
  'testRoots',
  'excludedGlobs',
  'entryPoints',
  ...FEATURE_LAYOUT_KEYS,
];

const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];

export function layoutKeysFor(preset: string | undefined, history?: unknown): string[] {
  const settings = [
    ...factRuleSettings(preset ?? 'typescript'),
    ...(fieldOf(history, 'coChange') === true ? ['layout.featureRoots'] : []),
  ];
  return TYPESCRIPT_PRESETS.includes(preset)
    ? LAYOUT_KEYS
    : FEATURE_LAYOUT_KEYS.filter((key) => settings.includes(`layout.${key}`));
}

export function validateLayout(
  layout: unknown,
  preset: string | undefined,
  history: unknown,
): void {
  if (!isPlainObject(layout)) {
    throw configError('"layout" must be an object');
  }
  const allowed = layoutKeysFor(preset, history);
  for (const [key, value] of Object.entries(layout)) {
    if (LAYOUT_KEYS.includes(key) && !allowed.includes(key)) {
      throw configError(
        `"layout.${key}" is not supported with "preset": "${String(preset)}": it describes TypeScript source folders. Layout keys with ${String(preset)}: ${keyList(allowed)}`,
      );
    }
    validateLayoutEntry(key, value, allowed);
  }
}

function keyList(keys: readonly string[]): string {
  return keys.length === 0 ? 'none yet' : keys.join(', ');
}

function validateLayoutEntry(key: string, value: unknown, allowed: readonly string[]): void {
  if (!allowed.includes(key)) {
    const suggestion = didYouMean(key, allowed);
    throw configError(
      `unknown layout key "${key}"${suggestion === '' ? `. Allowed layout keys: ${keyList(allowed)}` : suggestion}`,
    );
  }
  validateStringArray(value, `layout.${key}`);
  if (FEATURE_LAYOUT_KEYS.includes(key)) {
    validateFolderGlobs(key, value);
    return;
  }
  if (GLOB_LAYOUT_KEYS.includes(key)) {
    return;
  }
  const roots = textsOf(value);
  if (roots.length === 0) {
    throw configError(`"layout.${key}" must not be empty`);
  }
  for (const root of roots) {
    if (!isProjectRelativeDirectory(root, key)) {
      throw configError(`"layout.${key}" entries must be directories inside the project: ${root}`);
    }
  }
}

function isProjectRootSpelling(normalized: string): boolean {
  return normalized.split('/').every((segment) => segment === '' || segment === '.');
}

function isProjectRelativeDirectory(root: string, key: string): boolean {
  const normalized = root.replaceAll('\\', '/');
  if (key !== 'sourceRoots' && isProjectRootSpelling(normalized)) {
    return false;
  }
  return (
    !path.isAbsolute(normalized) &&
    !DRIVE_LETTER.test(normalized) &&
    !GLOB_CHARACTER.test(normalized) &&
    normalized.length > 0 &&
    !PARENT_SEGMENT.test(normalized)
  );
}
