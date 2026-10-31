import path from 'node:path';
import {
  configError,
  FEATURE_LAYOUT_KEYS,
  isPlainObject,
  validateFolderGlobs,
  validateStringArray,
} from '../../../shared/config.mjs';
import { factRuleSettings } from '../../../shared/project-rules/fact-rules.mjs';
import { didYouMean } from '../../../shared/messages/closest-match.mjs';

export const TYPESCRIPT_PRESETS = [undefined, 'typescript', 'javascript'];

const LAYOUT_KEYS = [
  'sourceRoots',
  'testRoots',
  'excludedGlobs',
  'entryPoints',
  ...FEATURE_LAYOUT_KEYS,
];

const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];

export function validateLayout(layout, preset, history) {
  if (!isPlainObject(layout)) {
    throw configError('"layout" must be an object');
  }
  const settings = [
    ...factRuleSettings(preset ?? 'typescript'),
    ...(history?.coChange === true ? ['layout.featureRoots'] : []),
  ];
  const allowed = TYPESCRIPT_PRESETS.includes(preset)
    ? LAYOUT_KEYS
    : FEATURE_LAYOUT_KEYS.filter((key) => settings.includes(`layout.${key}`));
  for (const [key, value] of Object.entries(layout)) {
    if (LAYOUT_KEYS.includes(key) && !allowed.includes(key)) {
      throw configError(
        `"layout.${key}" is not supported with "preset": "${preset}": it describes TypeScript source folders. Layout keys with ${preset}: ${keyList(allowed)}`,
      );
    }
    validateLayoutEntry(key, value, allowed);
  }
}

function keyList(keys) {
  return keys.length === 0 ? 'none yet' : keys.join(', ');
}

function validateLayoutEntry(key, value, allowed) {
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
  if (value.length === 0) {
    throw configError(`"layout.${key}" must not be empty`);
  }
  for (const root of value) {
    if (!isProjectRelativeDirectory(root)) {
      throw configError(`"layout.${key}" entries must be directories inside the project: ${root}`);
    }
  }
}

function isProjectRelativeDirectory(root) {
  const normalized = root.replaceAll('\\', '/');
  return (
    !path.isAbsolute(normalized) &&
    !/^[A-Za-z]:/.test(normalized) &&
    !/[*?{}[\]]/.test(normalized) &&
    !normalized.split('/').includes('..') &&
    normalized.replace(/^\.\/?|\/$/g, '').length > 0
  );
}
