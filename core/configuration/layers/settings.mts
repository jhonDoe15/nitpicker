import {
  configError as untypedConfigError,
  isNonEmptyString,
  validateProjectRelativePath,
} from '../../../shared/config.mts';
import { isPlainObject, isText, textOf } from '../../../shared/values/readers.mts';

const configError: (message: string) => Error = untypedConfigError;

type Expansion = { readonly expand: boolean } | { readonly expand?: undefined };

export type DeclaredEntry = {
  readonly path: string;
  readonly preset?: string;
  readonly settings?: object;
} & Expansion;

const PROJECT_ENTRY_KEYS = ['path', 'preset', 'expand', 'settings'];

export function validateExtends(value: unknown): void {
  if (!isNonEmptyString(value)) {
    throw configError('"extends" must be the path of a JSON config file, such as "../base.json"');
  }
  const text = textOf(value);
  if (text.startsWith('/') || /^[A-Za-z]:/u.test(text)) {
    throw configError(`"extends" must be a relative path inside the repository: ${text}`);
  }
  if (!text.endsWith('.json')) {
    throw configError(`"extends" must name a .json file: ${text}`);
  }
}

export function normalizeProjectPath(value: string): string {
  const normalized = value
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
  return normalized === '' ? '.' : normalized;
}

function validateEntryFields(
  entry: Record<string, unknown>,
  label: string,
  presets: readonly string[],
): void {
  for (const key of Object.keys(entry)) {
    if (!PROJECT_ENTRY_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "${label}". Allowed keys: ${PROJECT_ENTRY_KEYS.join(', ')}`,
      );
    }
  }
  validateProjectRelativePath(entry['path'], `${label}.path`);
  if (
    entry['preset'] !== undefined &&
    !(isText(entry['preset']) && presets.includes(entry['preset']))
  ) {
    throw configError(`"${label}.preset" must be one of: ${presets.join(', ')}`);
  }
  if (entry['expand'] !== undefined && typeof entry['expand'] !== 'boolean') {
    throw configError(`"${label}.expand" must be true or false`);
  }
  if (entry['settings'] !== undefined && !isPlainObject(entry['settings'])) {
    throw configError(`"${label}.settings" must be an object of config settings`);
  }
}

function entryOf(entry: unknown, label: string, presets: readonly string[]): DeclaredEntry {
  if (typeof entry === 'string') {
    validateProjectRelativePath(entry, label);
    return { path: normalizeProjectPath(entry) };
  }
  if (!isPlainObject(entry)) {
    throw configError(
      `"${label}" must be a path or an object with "path" and optional "preset", "expand" and "settings"`,
    );
  }
  validateEntryFields(entry, label, presets);
  const preset = entry['preset'];
  const expand = entry['expand'];
  const settings = entry['settings'];
  return {
    path: normalizeProjectPath(textOf(entry['path'])),
    ...(preset === undefined ? {} : { preset: textOf(preset) }),
    ...(typeof expand === 'boolean' ? { expand } : {}),
    ...(isPlainObject(settings) ? { settings } : {}),
  };
}

function hasOwnPresets(entries: readonly DeclaredEntry[]): boolean {
  const presets = entries.map(({ preset }) => preset);
  return !presets.includes(undefined) && new Set(presets).size === presets.length;
}

export function validateProjects(projects: unknown, presets: readonly string[]): DeclaredEntry[] {
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
  const seen = new Map<string, DeclaredEntry[]>();
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
