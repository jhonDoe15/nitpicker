import path from 'node:path';

export const DEFAULT_ENVIRONMENT = 'node';
export const TEST_ENVIRONMENTS_VARIABLE = 'NITPICKER_TEST_ENVIRONMENTS';
export const TEST_ENVIRONMENT_RULE = 'nitpicker/no-unused-dom-environment';
const DOM_ENVIRONMENTS = new Set(['jsdom', 'happy-dom']);
const SCRIPT_PATH = /\.[cm]?[jt]sx?$/u;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function environmentOf(testOptions) {
  if (!isRecord(testOptions)) return DEFAULT_ENVIRONMENT;
  if (isRecord(testOptions.browser) && testOptions.browser.enabled === true) return undefined;
  if (testOptions.environment === undefined) return DEFAULT_ENVIRONMENT;
  return typeof testOptions.environment === 'string' ? testOptions.environment : undefined;
}

function projectEnvironment(project, rootEnvironment) {
  if (isRecord(project.test) && project.test.environment !== undefined) {
    return environmentOf(project.test);
  }
  if (project.extends === true) return rootEnvironment;
  return project.extends === undefined || project.extends === false
    ? DEFAULT_ENVIRONMENT
    : undefined;
}

function projectPrefix(project, projectRoot) {
  const directory = project.test?.dir ?? project.test?.root ?? project.root ?? '.';
  if (typeof directory !== 'string') return undefined;
  const relative = path.isAbsolute(directory) ? path.relative(projectRoot, directory) : directory;
  const normalized = path.posix.normalize(relative.split(path.sep).join('/'));
  return normalized.startsWith('..') ? undefined : normalized;
}

function prefixed(prefix, globs) {
  return globs.map((glob) =>
    prefix === '.' ? glob.replace(/^\.\//u, '') : path.posix.join(prefix, glob),
  );
}

function setupEntry(entry, base) {
  if (path.isAbsolute(entry)) return entry;
  const isPath = entry.startsWith('.') || (SCRIPT_PATH.test(entry) && !entry.startsWith('@'));
  return isPath ? path.resolve(base, entry) : entry;
}

function setupFilesOf(testOptions, base) {
  const configured = testOptions.setupFiles;
  const entries = typeof configured === 'string' ? [configured] : stringList(configured);
  return entries.map((entry) => setupEntry(entry, base));
}

function withSetupFiles(result, setupFiles) {
  return setupFiles.length === 0 ? result : { ...result, setupFiles };
}

function projectScope(project, root, projectRoot) {
  if (!isRecord(project) || !isRecord(project.test)) return [];
  const include = stringList(project.test.include);
  const prefix = projectPrefix(project, projectRoot);
  if (include.length === 0 || prefix === undefined) return [];
  const inherited = project.extends === true ? root.setupFiles : [];
  const scope = {
    files: prefixed(prefix, include),
    ignores: prefixed(prefix, stringList(project.test.exclude)),
    environment: projectEnvironment(project, root.environment),
  };
  const own = setupFilesOf(project.test, path.resolve(projectRoot, prefix));
  return [withSetupFiles(scope, [...inherited, ...own])];
}

export function domLast(scopes) {
  function isDom(scope) {
    return DOM_ENVIRONMENTS.has(scope.environment);
  }
  return [...scopes.filter((scope) => !isDom(scope)), ...scopes.filter(isDom)];
}

function hasPerFileOverrides(testOptions) {
  return (
    isRecord(testOptions) &&
    (testOptions.environmentMatchGlobs !== undefined || testOptions.workspace !== undefined)
  );
}

export function environmentsFromConfig(config, projectRoot = process.cwd()) {
  const testOptions = isRecord(config) ? config.test : undefined;
  if (hasPerFileOverrides(testOptions)) return { environment: undefined, scopes: [] };
  const environment = environmentOf(testOptions);
  const setupFiles = isRecord(testOptions) ? setupFilesOf(testOptions, projectRoot) : [];
  const projects = isRecord(testOptions) ? testOptions.projects : undefined;
  if (!Array.isArray(projects) || projects.length === 0) {
    return withSetupFiles({ environment, scopes: [] }, setupFiles);
  }
  const root = { environment, setupFiles };
  return {
    environment: undefined,
    scopes: domLast(projects.flatMap((project) => projectScope(project, root, projectRoot))),
  };
}
