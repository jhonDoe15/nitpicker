import {
  configError,
  isNonEmptyString,
  isPlainObject,
  validateProjectRelativePath,
} from '../../../shared/config.mjs';

const PROJECT_ENTRY_KEYS = ['path', 'preset', 'expand', 'settings'];

export function validateExtends(value) {
  if (!isNonEmptyString(value)) {
    throw configError('"extends" must be the path of a JSON config file, such as "../base.json"');
  }
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value)) {
    throw configError(`"extends" must be a relative path inside the repository: ${value}`);
  }
  if (!value.endsWith('.json')) {
    throw configError(`"extends" must name a .json file: ${value}`);
  }
}

export function normalizeProjectPath(value) {
  const normalized = value
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
  return normalized === '' ? '.' : normalized;
}

function entryOf(entry, label, presets) {
  if (typeof entry === 'string') {
    validateProjectRelativePath(entry, label);
    return { path: normalizeProjectPath(entry) };
  }
  if (!isPlainObject(entry)) {
    throw configError(
      `"${label}" must be a path or an object with "path" and optional "preset", "expand" and "settings"`,
    );
  }
  for (const key of Object.keys(entry)) {
    if (!PROJECT_ENTRY_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "${label}". Allowed keys: ${PROJECT_ENTRY_KEYS.join(', ')}`,
      );
    }
  }
  validateProjectRelativePath(entry.path, `${label}.path`);
  if (entry.preset !== undefined && !presets.includes(entry.preset)) {
    throw configError(`"${label}.preset" must be one of: ${presets.join(', ')}`);
  }
  if (entry.expand !== undefined && typeof entry.expand !== 'boolean') {
    throw configError(`"${label}.expand" must be true or false`);
  }
  if (entry.settings !== undefined && !isPlainObject(entry.settings)) {
    throw configError(`"${label}.settings" must be an object of config settings`);
  }
  return {
    path: normalizeProjectPath(entry.path),
    ...(entry.preset === undefined ? {} : { preset: entry.preset }),
    ...(entry.expand === undefined ? {} : { expand: entry.expand }),
    ...(entry.settings === undefined ? {} : { settings: entry.settings }),
  };
}

function hasOwnPresets(entries) {
  const presets = entries.map(({ preset }) => preset);
  return !presets.includes(undefined) && new Set(presets).size === presets.length;
}

export function validateProjects(projects, presets) {
  if (!Array.isArray(projects)) {
    throw configError(
      '"projects" must be an array of project folders, ' +
        'such as ["web", { "path": "api", "preset": "python" }]. ' +
        'An empty array keeps the repository one project',
    );
  }
  const entries = projects.map((entry, index) =>
    entryOf(entry, `projects[${String(index)}]`, presets),
  );
  const seen = new Map();
  for (const entry of entries) {
    const earlier = seen.get(entry.path) ?? [];
    if (earlier.length > 0 && !hasOwnPresets([...earlier, entry])) {
      throw configError(
        `"projects" lists ${entry.path} twice. To gate one folder with two presets, ` +
          'give each entry its own "preset"',
      );
    }
    seen.set(entry.path, [...earlier, entry]);
  }
  return entries;
}
