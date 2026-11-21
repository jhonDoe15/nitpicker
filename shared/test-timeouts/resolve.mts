import { TEST_TIME_DEFAULTS } from '../policy.mts';
import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
  validateStringArray,
} from '../config.mts';
import { globMatcher } from '../paths/glob.mts';
import { didYouMean } from '../messages/closest-match.mts';
import { fieldOf, fieldsOf, isText } from '../values/readers.mts';

type LimitKey =
  'testTimeoutMs' | 'hookTimeoutMs' | 'testDeclarationCeilingMs' | 'hookDeclarationCeilingMs';
type Limits = Partial<Record<LimitKey, number>>;
type Tiers = {
  readonly testTimeoutMs: number;
  readonly hookTimeoutMs: number | undefined;
  readonly testDeclarationCeilingMs: number;
  readonly hookDeclarationCeilingMs: number;
};
type Project = Limits & { readonly language: string; readonly include: readonly string[] };
type Context = {
  readonly file?: string | undefined;
  readonly project?: string | undefined;
  readonly language?: string | undefined;
  readonly integration?: unknown;
};
export type ResolvedTimeouts = Tiers & { readonly language: string; readonly project?: string };

export const TEST_TIMEOUT_CEILING_MS = 10_000;
export const INTEGRATION_TEST_TIMEOUT_MS = 180_000;
export const INTEGRATION_HOOK_TIMEOUT_MS = 300_000;
export const TEST_TIMEOUT_LANGUAGES: readonly string[] = [
  'typescript',
  'javascript',
  'java',
  'kotlin',
  'python',
];
export const TIMEOUT_LIMIT_KEYS: readonly LimitKey[] = [
  'testTimeoutMs',
  'hookTimeoutMs',
  'testDeclarationCeilingMs',
  'hookDeclarationCeilingMs',
];
export const TIMEOUT_PROJECT_KEYS: readonly string[] = ['language', 'include'];
export const TIMEOUT_SECTION_KEYS: readonly string[] = ['defaults', 'languages', 'projects'];
const MILLISECONDS_PER_SECOND = 1000;

function objectWithKeys(value: unknown, label: string, allowed: readonly string[]): void {
  if (!isPlainObject(value)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw configError(`unknown key "${key}" in "${label}"${didYouMean(key, allowed)}`);
    }
  }
}

function validateLimits(value: unknown, label: string, metadata: readonly string[] = []): void {
  objectWithKeys(value, label, [...TIMEOUT_LIMIT_KEYS, ...metadata]);
  const limits = fieldsOf(value);
  for (const key of TIMEOUT_LIMIT_KEYS) {
    const limit = limits[key];
    if (limit !== undefined && (!Number.isSafeInteger(limit) || Number(limit) <= 0)) {
      throw configError(`"${label}.${key}" must be a positive integer in milliseconds`);
    }
  }
}

function validateLanguage(language: unknown, label: string): asserts language is string {
  if (typeof language !== 'string' || !TEST_TIMEOUT_LANGUAGES.includes(language)) {
    throw configError(`"${label}" must name a language: ${TEST_TIMEOUT_LANGUAGES.join(', ')}`);
  }
}

function validateProject(project: unknown, label: string): void {
  validateLimits(project, label, TIMEOUT_PROJECT_KEYS);
  const { language, include } = fieldsOf(project);
  validateLanguage(language, `${label}.language`);
  validateStringArray(include, `${label}.include`);
  if (include.length === 0) {
    throw configError(`"${label}.include" needs at least one pattern`);
  }
  if (new Set(include).size !== include.length) {
    throw configError(`"${label}.include" must not contain duplicates`);
  }
  for (const glob of include) {
    validateProjectRelativePath(glob, `${label}.include`);
    if (glob.startsWith('!')) {
      throw configError(`"${label}.include" cannot negate a pattern`);
    }
    globMatcher(glob);
  }
}

function validateLanguageLimits(languages: unknown, label: string): void {
  objectWithKeys(languages, label, TEST_TIMEOUT_LANGUAGES);
  for (const [language, limits] of Object.entries(fieldsOf(languages))) {
    validateLanguage(language, label);
    validateLimits(limits, `${label}.${language}`);
  }
}

function validateProjects(projects: unknown, label: string): void {
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

export function validateTestTimeouts(settings: unknown): void {
  const label = 'tools.tests.timeouts';
  objectWithKeys(settings, label, TIMEOUT_SECTION_KEYS);
  const { defaults, languages, projects } = fieldsOf(settings);
  if (defaults !== undefined) {
    validateLimits(defaults, `${label}.defaults`);
  }
  if (languages !== undefined) {
    validateLanguageLimits(languages, `${label}.languages`);
  }
  if (projects !== undefined) {
    validateProjects(projects, `${label}.projects`);
  }
}

function limitsOf(settings: unknown): Limits {
  const fields = fieldsOf(settings);
  const limits: Limits = {};
  for (const key of TIMEOUT_LIMIT_KEYS) {
    const value = fields[key];
    if (typeof value === 'number') {
      limits[key] = value;
    }
  }
  return limits;
}

function projectOf(settings: unknown): Project | undefined {
  const { language, include } = fieldsOf(settings);
  return typeof language === 'string' && Array.isArray(include) && include.every(isText)
    ? { ...limitsOf(settings), language, include }
    : undefined;
}

function projectsOf(settings: unknown): Record<string, Project> {
  const projects: Record<string, Project> = {};
  for (const [name, value] of Object.entries(fieldsOf(settings))) {
    const project = projectOf(value);
    if (project !== undefined) {
      projects[name] = project;
    }
  }
  return projects;
}

function matchingProject(
  projects: Record<string, Project>,
  context: Context,
): [string, Project] | undefined {
  const { file } = context;
  const selected = Object.entries(projects).filter(
    ([, settings]) =>
      file !== undefined &&
      settings.include.some((glob) =>
        globMatcher(glob).test(file.replaceAll('\\', '/').replace(/^\.\//u, '')),
      ),
  );
  if (selected.length > 1) {
    throw configError(
      `test file "${file ?? ''}" belongs to multiple timeout projects: ${selected.map(([name]) => name).join(', ')}`,
    );
  }
  if (context.project === undefined) {
    return selected[0];
  }
  const project = Object.hasOwn(projects, context.project) ? projects[context.project] : undefined;
  if (project === undefined) {
    throw configError(`unknown timeout project "${context.project}"`);
  }
  if (context.file !== undefined && selected[0]?.[0] !== context.project) {
    throw configError(
      `test file "${context.file}" does not belong to timeout project "${context.project}"`,
    );
  }
  return [context.project, project];
}

const INTEGRATION_FLOORS = {
  testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
  hookTimeoutMs: INTEGRATION_HOOK_TIMEOUT_MS,
  testDeclarationCeilingMs: INTEGRATION_TEST_TIMEOUT_MS,
  hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
};

function withIntegrationFloors(limits: Tiers, integration: unknown): Tiers {
  return integration === true
    ? {
        testTimeoutMs: Math.max(limits.testTimeoutMs, INTEGRATION_FLOORS.testTimeoutMs),
        hookTimeoutMs: Math.max(limits.hookTimeoutMs ?? 0, INTEGRATION_FLOORS.hookTimeoutMs),
        testDeclarationCeilingMs: Math.max(
          limits.testDeclarationCeilingMs,
          INTEGRATION_FLOORS.testDeclarationCeilingMs,
        ),
        hookDeclarationCeilingMs: Math.max(
          limits.hookDeclarationCeilingMs,
          INTEGRATION_FLOORS.hookDeclarationCeilingMs,
        ),
      }
    : limits;
}

export function resolveTestTimeouts(config: unknown = {}, context: Context = {}): ResolvedTimeouts {
  const thresholds = { ...TEST_TIME_DEFAULTS, ...fieldsOf(fieldOf(config, 'thresholds')) };
  const tests = fieldOf(fieldOf(fieldOf(config, 'tools'), 'tests'), 'timeouts') ?? {};
  validateTestTimeouts(tests);
  const settings = fieldsOf(tests);
  const selected = matchingProject(projectsOf(settings['projects'] ?? {}), context);
  const language =
    selected?.[1].language ?? context.language ?? fieldOf(config, 'preset') ?? 'typescript';
  validateLanguage(language, 'timeout subject language');
  const tiers = {
    testTimeoutMs:
      TEST_TIMEOUT_CEILING_MS +
      Math.ceil(
        Math.max(thresholds.unitTestSeconds, thresholds.integrationTestSeconds) *
          MILLISECONDS_PER_SECOND,
      ),
    hookTimeoutMs: undefined,
    testDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
    hookDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
    ...limitsOf(fieldsOf(fieldOf(settings['languages'], language))),
    ...limitsOf(settings['defaults']),
  };
  return {
    language,
    ...withIntegrationFloors(tiers, context.integration),
    ...limitsOf(selected?.[1]),
    ...(selected === undefined ? {} : { project: selected[0] }),
  };
}
