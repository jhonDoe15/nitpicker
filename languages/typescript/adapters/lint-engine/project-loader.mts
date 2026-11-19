import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { FlatEntry } from './typed/flat-config.mts';

type JitiLoader = { import(url: string): Promise<unknown> };
type Jiti = {
  createJiti: (file: string, options: { moduleCache: boolean }) => JitiLoader;
};
type JitiAttempt = { loader?: unknown; error?: unknown };

const TYPESCRIPT_CONFIG = /\.[cm]?ts$/u;
const ENTRY_KEYS = new Set([
  'name',
  'basePath',
  'files',
  'ignores',
  'language',
  'languageOptions',
  'linterOptions',
  'processor',
  'plugins',
  'rules',
  'settings',
]);

async function described<Result>(
  message: string,
  operation: () => Result | Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

function entryLabel(entry: FlatEntry): string {
  return typeof entry['name'] === 'string' ? `Config "${entry['name']}"` : 'Config (unnamed)';
}

function checkedEntries(label: string, entries: readonly FlatEntry[]): readonly FlatEntry[] {
  for (const entry of entries) {
    const unknown = Object.keys(entry).find((key) => !ENTRY_KEYS.has(key));
    if (unknown !== undefined) {
      throw new TypeError(
        `${label} is not a valid flat config: ${entryLabel(entry)}: Unexpected key "${unknown}" found.`,
      );
    }
  }
  return entries;
}

export async function projectEntries(file: string): Promise<FlatEntry[]> {
  const label = `ESLint config ${path.basename(file)}`;
  const exported = await described(`${label} could not be loaded`, () => loadedConfig(file));
  if (typeof exported !== 'object' || exported === null) {
    throw new TypeError(`${label} must export a flat config array or object`);
  }
  const { defineConfig } = eslintConfigModule();
  const entries = await described(`${label} is not a valid flat config`, () =>
    defineConfig(exported),
  );
  return [...checkedEntries(label, entries)];
}

function eslintConfigModule(): { defineConfig: (config: object) => FlatEntry[] } {
  const load: (id: string) => { defineConfig: (config: object) => FlatEntry[] } = createRequire(
    import.meta.url,
  );
  return load('eslint/config');
}

async function loadedConfig(file: string): Promise<unknown> {
  const url = pathToFileURL(file).href;
  if (!TYPESCRIPT_CONFIG.test(file)) {
    const loaded: unknown = await import(url);
    return fieldOf(loaded, 'default');
  }
  const loaded = await typescriptLoader(file).import(url);
  return fieldOf(loaded, 'default') ?? loaded;
}

function typescriptLoader(file: string): JitiLoader {
  const attempts = [file, import.meta.filename].map(jitiFrom);
  const found = attempts.flatMap(({ loader }) => (isJiti(loader) ? [loader] : [])).at(0);
  if (found === undefined) {
    throw new Error(
      "the 'jiti' library (version 2 or later) is required for loading TypeScript configuration files; install it in the project, as ESLint itself needs",
      { cause: attempts.find(({ error }) => error !== undefined)?.error },
    );
  }
  return found.createJiti(file, { moduleCache: false });
}

function isJiti(value: unknown): value is Jiti {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'createJiti' in value &&
    typeof value.createJiti === 'function'
  );
}

function jitiFrom(file: string): JitiAttempt {
  try {
    const loader: unknown = createRequire(file)('jiti');
    return { loader };
  } catch (error) {
    return { error };
  }
}
