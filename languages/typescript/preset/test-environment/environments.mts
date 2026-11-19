import path from 'node:path';
import {
  fieldOf,
  isPlainObject as isRecord,
  isText,
  listOf,
} from '../../../../shared/values/readers.mts';
import type { EnvironmentScope, Environments, TestFiles } from './typed/environment-types.mts';

type Fields = Readonly<Record<string, unknown>>;
type RootOptions = {
  readonly environment: string | undefined;
  readonly setupFiles: readonly string[];
};

export const DEFAULT_ENVIRONMENT = 'node';
export const TEST_ENVIRONMENTS_VARIABLE = 'NITPICKER_TEST_ENVIRONMENTS';
export const TEST_ENVIRONMENT_RULE = 'nitpicker/no-unused-dom-environment';
const DOM_ENVIRONMENTS = new Set<unknown>(['jsdom', 'happy-dom']);
const SCRIPT_PATH = /\.[cm]?[jt]sx?$/u;

function stringList(value: unknown): readonly string[] {
  const items = listOf(value);
  return items.every(isText) ? items : [];
}

function environmentOf(testOptions: unknown): string | undefined {
  if (!isRecord(testOptions)) {
    return DEFAULT_ENVIRONMENT;
  }
  if (isRecord(testOptions['browser']) && testOptions['browser']['enabled'] === true) {
    return undefined;
  }
  if (testOptions['environment'] === undefined) {
    return DEFAULT_ENVIRONMENT;
  }
  return typeof testOptions['environment'] === 'string' ? testOptions['environment'] : undefined;
}

function projectEnvironment(
  project: Fields,
  rootEnvironment: string | undefined,
): string | undefined {
  if (isRecord(project['test']) && project['test']['environment'] !== undefined) {
    return environmentOf(project['test']);
  }
  if (project['extends'] === true) {
    return rootEnvironment;
  }
  return project['extends'] === undefined || project['extends'] === false
    ? DEFAULT_ENVIRONMENT
    : undefined;
}

function projectPrefix(project: Fields, projectRoot: string): string | undefined {
  const test = isRecord(project['test']) ? project['test'] : undefined;
  const directory = test?.['dir'] ?? test?.['root'] ?? project['root'] ?? '.';
  if (typeof directory !== 'string') {
    return undefined;
  }
  const relative = path.isAbsolute(directory) ? path.relative(projectRoot, directory) : directory;
  const normalized = path.posix.normalize(relative.split(path.sep).join('/'));
  return normalized.startsWith('..') ? undefined : normalized;
}

function prefixed(prefix: string, globs: readonly string[]): string[] {
  return globs.map((glob) =>
    prefix === '.' ? glob.replace(/^\.\//u, '') : path.posix.join(prefix, glob),
  );
}

function setupEntry(entry: string, base: string): string {
  if (path.isAbsolute(entry)) {
    return entry;
  }
  const isPath = entry.startsWith('.') || (SCRIPT_PATH.test(entry) && !entry.startsWith('@'));
  return isPath ? path.resolve(base, entry) : entry;
}

function setupFilesOf(testOptions: Fields, base: string): readonly string[] {
  const configured = testOptions['setupFiles'];
  const entries = typeof configured === 'string' ? [configured] : stringList(configured);
  return entries.map((entry) => setupEntry(entry, base));
}

function withSetupFiles<Result extends object>(
  result: Result,
  setupFiles: readonly string[],
): Result & { readonly setupFiles?: readonly string[] } {
  return setupFiles.length === 0 ? result : { ...result, setupFiles };
}

function projectScope(
  project: unknown,
  root: RootOptions,
  projectRoot: string,
): EnvironmentScope[] {
  if (!(isRecord(project) && isRecord(project['test']))) {
    return [];
  }
  const include = stringList(project['test']['include']);
  const prefix = projectPrefix(project, projectRoot);
  if (include.length === 0 || prefix === undefined) {
    return [];
  }
  const inherited = project['extends'] === true ? root.setupFiles : [];
  const scope = {
    files: prefixed(prefix, include),
    ignores: prefixed(prefix, stringList(project['test']['exclude'])),
    environment: projectEnvironment(project, root.environment),
  };
  const own = setupFilesOf(project['test'], path.resolve(projectRoot, prefix));
  return [withSetupFiles(scope, [...inherited, ...own])];
}

function projectTestFiles(project: unknown, projectRoot: string): TestFiles {
  const prefix =
    isRecord(project) && isRecord(project['test'])
      ? projectPrefix(project, projectRoot)
      : undefined;
  if (!isRecord(project) || !isRecord(project['test']) || prefix === undefined) {
    return { include: [], exclude: [] };
  }
  return {
    include: prefixed(prefix, stringList(project['test']['include'])),
    exclude: prefixed(prefix, stringList(project['test']['exclude'])),
  };
}

export function testFilesFromConfig(config: unknown, projectRoot: string): TestFiles {
  const testOptions = isRecord(config) ? config['test'] : undefined;
  if (!isRecord(testOptions)) {
    return { include: [], exclude: [] };
  }
  const projects = listOf(testOptions['projects']);
  const scoped = projects.map((project) => projectTestFiles(project, projectRoot));
  return {
    include: [...stringList(testOptions['include']), ...scoped.flatMap(({ include }) => include)],
    exclude: [...stringList(testOptions['exclude']), ...scoped.flatMap(({ exclude }) => exclude)],
  };
}

export function isDomEnvironment(environment: unknown): boolean {
  return DOM_ENVIRONMENTS.has(environment);
}

export function hasDomEnvironment(environments: unknown): boolean {
  const scopes = listOf(fieldOf(environments, 'scopes'));
  const environment = fieldOf(environments, 'environment');
  return [environment, ...scopes.map((scope) => fieldOf(scope, 'environment'))].some(
    isDomEnvironment,
  );
}

export function domLast(scopes: readonly EnvironmentScope[]): EnvironmentScope[] {
  function isDom(scope: EnvironmentScope): boolean {
    return DOM_ENVIRONMENTS.has(scope.environment);
  }
  return [...scopes.filter((scope) => !isDom(scope)), ...scopes.filter(isDom)];
}

function hasPerFileOverrides(testOptions: unknown): boolean {
  return (
    isRecord(testOptions) &&
    (testOptions['environmentMatchGlobs'] !== undefined || testOptions['workspace'] !== undefined)
  );
}

export function environmentsFromConfig(config: unknown, projectRoot: string): Environments {
  const testOptions = isRecord(config) ? config['test'] : undefined;
  if (hasPerFileOverrides(testOptions)) {
    return { environment: undefined, scopes: [] };
  }
  const environment = environmentOf(testOptions);
  const setupFiles = isRecord(testOptions) ? setupFilesOf(testOptions, projectRoot) : [];
  const projects = isRecord(testOptions) ? testOptions['projects'] : undefined;
  if (!Array.isArray(projects) || projects.length === 0) {
    return withSetupFiles({ environment, scopes: [] }, setupFiles);
  }
  const root = { environment, setupFiles };
  return {
    environment: undefined,
    scopes: domLast(projects.flatMap((project) => projectScope(project, root, projectRoot))),
  };
}
