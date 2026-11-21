import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilePaths } from '../../typed/files/file-views.mts';

const RUNNER_CONFIG =
  /^(?:vite(?:st)?(?:\.[\w-]+)?\.config|vitest\.(?:workspace|projects)|jest\.config(?:\.[\w-]+)?)\.[cm]?[jt]s(?:on)?$/u;
const MANIFEST = 'package.json';
const CLEARING_FLAG = /\b(?:clearMocks|resetMocks|mockReset|restoreMocks)['"]?\s*:(?!\s*false\b)/u;
const CLEARING_CALL =
  /\b(?:clearAllMocks|resetAllMocks|restoreAllMocks|mockClear|mockReset|mockRestore|resetCalls)\b(?!['"]\s*:)/u;
const SELF_CLEARING_RUNNERS = /"(?:react-scripts|@craco\/craco|react-app-rewired)"\s*:/u;
const SPECIFIERS = /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*)['"]([^'"]+)['"]/gu;
const PATH_LITERALS =
  /['"`](?:<rootDir>\/)?((?:\.{1,2}\/)?[^'"`\s]+\.[cm]?[jt]sx?|\.{1,2}\/[^'"`\s.]+(?:\/[^'"`\s.]+)*)['"`]/gu;
const PROJECT_ALIAS = /^(?:#|@\/|~\/)/u;
const FOLLOWED_LEVELS = 3;
const PRESETS = /\bpreset\s*:\s*['"]([^'"]+)['"]/gu;
const KNOWN_PRESETS = /^ts-jest(?:\/|$)/u;
const SHARED_CONFIG =
  /(?:^|[/@.-])(?:configs?|presets?|jest|vitest|test|testing|shared)(?:[/.-]|$)/u;
const TOOLING =
  /^(?:node:|(?:path|url|fs|os|module|process)$|vite(?:st)?(?:\/|$)|@vitejs\/|@vitest\/|vite-|unplugin-|@rollup\/|rollup-plugin-|ts-jest|jest-|babel-jest|@swc\/|@testing-library\/|happy-dom|jsdom|dotenv|@storybook\/|@sveltejs\/|@analogjs\/|@nx\/)/u;
const CODE_EXTENSIONS = ['', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'];
const INDEX_FILES = CODE_EXTENSIONS.slice(1).map((extension) => `/index${extension}`);

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function matchesOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].flatMap(([, value]) => (value === undefined ? [] : [value]));
}

type Related = { readonly file: string; readonly text: string };

function resolvedFile(candidates: readonly string[]): Related | undefined {
  return candidates
    .flatMap((base) => [...CODE_EXTENSIONS, ...INDEX_FILES].map((suffix) => `${base}${suffix}`))
    .map((file) => ({ file, text: readText(file) }))
    .find((each): each is Related => each.text !== undefined);
}

function directlyRelated(file: string, text: string, projectRoot: string): Related[] {
  const directory = path.dirname(file);
  const relative = matchesOf(text, SPECIFIERS).filter((specifier) => specifier.startsWith('.'));
  const literals = matchesOf(text, PATH_LITERALS);
  return [
    ...relative.map((specifier) => resolvedFile([path.resolve(directory, specifier)])),
    ...literals.map((literal) =>
      resolvedFile([path.resolve(directory, literal), path.resolve(projectRoot, literal)]),
    ),
  ].flatMap((each) => (each === undefined ? [] : [each]));
}

function relatedTexts(configFile: string, text: string, projectRoot: string): string[] {
  const seen = new Map<string, string>();
  let level: Related[] = [{ file: configFile, text }];
  for (let depth = 0; depth < FOLLOWED_LEVELS && level.length > 0; depth += 1) {
    level = level
      .flatMap((each) => directlyRelated(each.file, each.text, projectRoot))
      .filter((each) => !seen.has(each.file) && each.file !== configFile);
    for (const each of level) {
      seen.set(each.file, each.text);
    }
  }
  return [...seen.values()];
}

function hasUnknownBase(text: string): boolean {
  const packages = matchesOf(text, SPECIFIERS).filter(
    (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'),
  );
  return (
    packages.some(
      (specifier) =>
        PROJECT_ALIAS.test(specifier) ||
        (SHARED_CONFIG.test(specifier) && !TOOLING.test(specifier)),
    ) || matchesOf(text, PRESETS).some((preset) => !KNOWN_PRESETS.test(preset))
  );
}

function clears(text: string): boolean {
  return CLEARING_FLAG.test(text) || CLEARING_CALL.test(text);
}

function manifestClears(text: string): boolean {
  return SELF_CLEARING_RUNNERS.test(text) || (text.includes('"jest"') && CLEARING_FLAG.test(text));
}

function configClears(file: string, projectRoot: string): boolean {
  const text = readText(file) ?? '';
  if (path.basename(file) === MANIFEST) {
    return manifestClears(text);
  }
  return clears(text) || hasUnknownBase(text) || relatedTexts(file, text, projectRoot).some(clears);
}

function isRunnerConfig(file: string): boolean {
  const name = path.posix.basename(file);
  return name === MANIFEST || RUNNER_CONFIG.test(name);
}

export function mockClearingScopes(projectRoot: string): string[] {
  return projectFilePaths(projectRoot)
    .filter(isRunnerConfig)
    .filter((file) => configClears(path.join(projectRoot, ...file.split('/')), projectRoot))
    .map((file) => path.posix.dirname(file));
}
