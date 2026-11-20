import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilePaths } from '../../typed/files/file-views.mts';

const RUNNER_CONFIG =
  /^(?:vite(?:st)?(?:\.[\w-]+)?\.config|vitest\.(?:workspace|projects)|jest\.config(?:\.[\w-]+)?)\.[cm]?[jt]s(?:on)?$/u;
const MANIFEST = 'package.json';
const CLEARING =
  /\b(?:clearMocks|resetMocks|mockReset|restoreMocks|clearAllMocks|resetAllMocks|restoreAllMocks)\b/u;
const SELF_CLEARING_RUNNERS = /"(?:react-scripts|@craco\/craco|react-app-rewired)"\s*:/u;
const SPECIFIERS = /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*)['"]([^'"]+)['"]/gu;
const PATH_LITERALS = /['"`](?:<rootDir>\/)?([^'"`\s]+\.[cm]?[jt]sx?)['"`]/gu;
const PRESETS = /\bpreset\s*:\s*['"]([^'"]+)['"]/gu;
const KNOWN_PRESETS = /^ts-jest(?:\/|$)/u;
const SHARED_CONFIG = /(?:^|[/@-])(?:configs?|presets?|jest|vitest|test|testing)(?:[/-]|$)/u;
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

function resolvedText(candidates: readonly string[]): string | undefined {
  return candidates
    .flatMap((base) => [...CODE_EXTENSIONS, ...INDEX_FILES].map((suffix) => `${base}${suffix}`))
    .map(readText)
    .find((text) => text !== undefined);
}

function relatedTexts(configFile: string, text: string, projectRoot: string): string[] {
  const directory = path.dirname(configFile);
  const relative = matchesOf(text, SPECIFIERS).filter((specifier) => specifier.startsWith('.'));
  const literals = matchesOf(text, PATH_LITERALS);
  return [
    ...relative.map((specifier) => resolvedText([path.resolve(directory, specifier)])),
    ...literals.map((literal) =>
      resolvedText([path.resolve(directory, literal), path.resolve(projectRoot, literal)]),
    ),
  ].flatMap((each) => (each === undefined ? [] : [each]));
}

function hasUnknownBase(text: string): boolean {
  const packages = matchesOf(text, SPECIFIERS).filter(
    (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'),
  );
  return (
    packages.some((specifier) => SHARED_CONFIG.test(specifier) && !TOOLING.test(specifier)) ||
    matchesOf(text, PRESETS).some((preset) => !KNOWN_PRESETS.test(preset))
  );
}

function manifestClears(text: string): boolean {
  return SELF_CLEARING_RUNNERS.test(text) || (text.includes('"jest"') && CLEARING.test(text));
}

function configClears(file: string, projectRoot: string): boolean {
  const text = readText(file) ?? '';
  if (path.basename(file) === MANIFEST) {
    return manifestClears(text);
  }
  return (
    CLEARING.test(text) ||
    hasUnknownBase(text) ||
    relatedTexts(file, text, projectRoot).some((related) => CLEARING.test(related))
  );
}

function isRunnerConfig(file: string): boolean {
  const name = path.posix.basename(file);
  return name === MANIFEST || RUNNER_CONFIG.test(name);
}

/**
 * The folders (relative to the project root, `.` for the root) whose tests run with mocks cleared
 * between tests: a runner config there sets `clearMocks`, `resetMocks`/`mockReset` or
 * `restoreMocks`, a setup file or module it names clears every mock, the runner is one that clears
 * them by default (`react-scripts`), or the config builds on a shared config or preset that cannot
 * be read, which counts as clearing so that no test is reported on a guess.
 */
export function mockClearingScopes(projectRoot: string): string[] {
  return projectFilePaths(projectRoot)
    .filter(isRunnerConfig)
    .filter((file) => configClears(path.join(projectRoot, ...file.split('/')), projectRoot))
    .map((file) => path.posix.dirname(file));
}
