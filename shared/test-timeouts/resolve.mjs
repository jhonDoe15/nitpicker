import { TEST_TIME_DEFAULTS } from '../policy.mjs';
import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
  validateStringArray,
} from '../config.mjs';
import { globToRegExp } from '../glob.mjs';

export const TEST_TIMEOUT_CEILING_MS = 10_000;
export const TEST_TIMEOUT_LANGUAGES = ['typescript', 'javascript', 'java', 'kotlin', 'python'];
export const TIMEOUT_LIMIT_KEYS = [
  'testTimeoutMs',
  'hookTimeoutMs',
  'testDeclarationCeilingMs',
  'hookDeclarationCeilingMs',
];
const MILLISECONDS_PER_SECOND = 1000;

function objectWithKeys(value, label, allowed) {
  if (!isPlainObject(value)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw configError(`unknown key "${key}" in "${label}"`);
    }
  }
}

function validateLimits(value, label, metadata = []) {
  objectWithKeys(value, label, [...TIMEOUT_LIMIT_KEYS, ...metadata]);
  for (const key of TIMEOUT_LIMIT_KEYS) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] <= 0)) {
      throw configError(`"${label}.${key}" must be a positive integer in milliseconds`);
    }
  }
}

function validateLanguage(language, label) {
  if (!TEST_TIMEOUT_LANGUAGES.includes(language)) {
    throw configError(`"${label}" must name a language: ${TEST_TIMEOUT_LANGUAGES.join(', ')}`);
  }
}

function validateProject(project, label) {
  validateLimits(project, label, ['language', 'include']);
  validateLanguage(project.language, `${label}.language`);
  validateStringArray(project.include, `${label}.include`);
  if (project.include.length === 0) {
    throw configError(`"${label}.include" needs at least one pattern`);
  }
  if (new Set(project.include).size !== project.include.length) {
    throw configError(`"${label}.include" must not contain duplicates`);
  }
  for (const glob of project.include) {
    validateProjectRelativePath(glob, `${label}.include`);
    if (glob.startsWith('!')) {
      throw configError(`"${label}.include" cannot negate a pattern`);
    }
    globToRegExp(glob);
  }
}

function validateLanguageLimits(languages, label) {
  objectWithKeys(languages, label, TEST_TIMEOUT_LANGUAGES);
  for (const [language, limits] of Object.entries(languages)) {
    validateLanguage(language, label);
    validateLimits(limits, `${label}.${language}`);
  }
}

function validateProjects(projects, label) {
  if (!isPlainObject(projects)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const [name, project] of Object.entries(projects)) {
    if (name.trim() === '') {
      throw configError(`"${label}" needs a non-empty project name`);
    }
    validateProject(project, `${label}.${name}`);
  }
}

export function validateTestTimeouts(settings) {
  const label = 'tools.tests.timeouts';
  objectWithKeys(settings, label, ['defaults', 'languages', 'projects']);
  if (settings.defaults !== undefined) {
    validateLimits(settings.defaults, `${label}.defaults`);
  }
  if (settings.languages !== undefined) {
    validateLanguageLimits(settings.languages, `${label}.languages`);
  }
  if (settings.projects !== undefined) {
    validateProjects(settings.projects, `${label}.projects`);
  }
}

function matchingProject(projects, context) {
  const selected = Object.entries(projects).filter(
    ([, settings]) =>
      context.file !== undefined &&
      settings.include.some((glob) =>
        globToRegExp(glob).test(context.file.replaceAll('\\', '/').replace(/^\.\//u, '')),
      ),
  );
  if (selected.length > 1) {
    throw configError(
      `test file "${context.file}" belongs to multiple timeout projects: ${selected.map(([name]) => name).join(', ')}`,
    );
  }
  if (context.project === undefined) {
    return selected[0];
  }
  if (!Object.hasOwn(projects, context.project)) {
    throw configError(`unknown timeout project "${context.project}"`);
  }
  if (context.file !== undefined && selected[0]?.[0] !== context.project) {
    throw configError(
      `test file "${context.file}" does not belong to timeout project "${context.project}"`,
    );
  }
  return [context.project, projects[context.project]];
}

function limitsOf(settings = {}) {
  return Object.fromEntries(
    TIMEOUT_LIMIT_KEYS.filter((key) => settings[key] !== undefined).map((key) => [
      key,
      settings[key],
    ]),
  );
}

export function resolveTestTimeouts(config = {}, context = {}) {
  const thresholds = { ...TEST_TIME_DEFAULTS, ...config.thresholds };
  const settings = config.tools?.tests?.timeouts ?? {};
  validateTestTimeouts(settings);
  const selected = matchingProject(settings.projects ?? {}, context);
  const language = selected?.[1].language ?? context.language ?? config.preset ?? 'typescript';
  validateLanguage(language, 'timeout subject language');
  return {
    language,
    testTimeoutMs:
      TEST_TIMEOUT_CEILING_MS +
      Math.ceil(
        Math.max(thresholds.unitTestSeconds, thresholds.integrationTestSeconds) *
          MILLISECONDS_PER_SECOND,
      ),
    hookTimeoutMs: undefined,
    testDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
    hookDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
    ...limitsOf(settings.languages?.[language]),
    ...limitsOf(settings.defaults),
    ...limitsOf(selected?.[1]),
    ...(selected === undefined ? {} : { project: selected[0] }),
  };
}
