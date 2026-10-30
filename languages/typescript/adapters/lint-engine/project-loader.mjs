import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'eslint/config';

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

async function described(message, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

function entryLabel(entry) {
  return typeof entry.name === 'string' ? `Config "${entry.name}"` : 'Config (unnamed)';
}

function checkedEntries(label, entries) {
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

export async function projectEntries(file) {
  const label = `ESLint config ${path.basename(file)}`;
  const exported = await described(`${label} could not be loaded`, () => loadedConfig(file));
  if (typeof exported !== 'object' || exported === null) {
    throw new TypeError(`${label} must export a flat config array or object`);
  }
  const entries = await described(`${label} is not a valid flat config`, () =>
    defineConfig(exported),
  );
  return checkedEntries(label, entries);
}

async function loadedConfig(file) {
  const url = pathToFileURL(file).href;
  if (!TYPESCRIPT_CONFIG.test(file)) {
    const loaded = await import(url);
    return loaded.default;
  }
  const loaded = await typescriptLoader(file).import(url);
  return loaded?.default ?? loaded;
}

function typescriptLoader(file) {
  const attempts = [file, import.meta.filename].map(jitiFrom);
  const found = attempts.find(({ loader }) => typeof loader?.createJiti === 'function');
  if (found === undefined) {
    throw new Error(
      "the 'jiti' library (version 2 or later) is required for loading TypeScript configuration files; install it in the project, as ESLint itself needs",
      { cause: attempts.find(({ error }) => error !== undefined)?.error },
    );
  }
  return found.loader.createJiti(file, { moduleCache: false });
}

function jitiFrom(file) {
  try {
    return { loader: createRequire(file)('jiti') };
  } catch (error) {
    return { error };
  }
}
