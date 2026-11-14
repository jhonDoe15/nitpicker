import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../../shared/filesystem.mjs';
import { parsedTsconfig } from '../../../../languages/typescript/preset/modules/tsconfig-files.mjs';

const TSCONFIG = 'tsconfig.json';
const PATHS_LABEL = 'tsconfig paths';
const REFERENCES_LABEL = 'tsconfig references';
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?)$/u;
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);

function relativeFolder(directory, target) {
  return path.relative(directory, target).split(path.sep).join('/') || '.';
}

function aliasPrefix(alias) {
  return alias.replace(/\*.*$/u, '');
}

function sourceTexts(directory) {
  const files = filesUnder(directory, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name),
  });
  return [...files]
    .filter((file) => SCRIPT_FILE.test(file))
    .map((file) => readFileSync(file, 'utf8'));
}

function importsAlias(texts, alias) {
  const prefix = aliasPrefix(alias);
  return texts.some(
    (text) =>
      text.includes(`'${prefix}`) || text.includes(`"${prefix}`) || text.includes(`\`${prefix}`),
  );
}

function pathTargets(directory, options) {
  const base = options.baseUrl ?? options.pathsBasePath ?? directory;
  const texts = sourceTexts(directory);
  return Object.entries(options.paths ?? {})
    .filter(([alias]) => importsAlias(texts, alias))
    .flatMap(([, targets]) => (Array.isArray(targets) ? targets : []))
    .map((target) => path.resolve(base, aliasPrefix(String(target))));
}

export function typescriptUnit(directory) {
  const configFile = path.join(directory, TSCONFIG);
  if (!existsSync(configFile)) {
    return undefined;
  }
  const parsed = parsedTsconfig(configFile);
  const viaPaths = pathTargets(directory, parsed.options ?? {}).map((target) =>
    relativeFolder(directory, target),
  );
  const viaReferences = (parsed.projectReferences ?? []).map(({ path: target }) =>
    relativeFolder(directory, target.endsWith('.json') ? path.dirname(target) : target),
  );
  return {
    names: [],
    needs: [],
    folders: [...viaPaths, ...viaReferences],
    labels: new Map([
      ...viaReferences.map((folder) => [folder, REFERENCES_LABEL]),
      ...viaPaths.map((folder) => [folder, PATHS_LABEL]),
    ]),
  };
}
