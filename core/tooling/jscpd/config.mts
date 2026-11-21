import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isRealPathInside } from '../../../shared/conventions/read-inside.mjs';
import {
  JSCPD_PROJECT_FILE,
  missingProjectConfig as untypedMissingProjectConfig,
} from '../../../shared/conventions/tool-precedence.mjs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import {
  fieldOf,
  fieldsOf,
  isPlainObject,
  isText,
  listOf,
  parseJson,
} from '../../../shared/values/readers.mts';

const missingProjectConfig: (tool: string, looked: string) => string = untypedMissingProjectConfig;

type ProjectKey =
  | 'minTokens'
  | 'minLines'
  | 'maxLines'
  | 'maxSize'
  | 'mode'
  | 'skipComments'
  | 'ignore'
  | 'ignorePattern'
  | 'ignoreCase';
type Check = readonly [(value: unknown) => boolean, string];
type ProjectConfig = Record<string, unknown>;

export type JscpdSettings = {
  readonly minTokens?: number;
  readonly minLines?: number;
  readonly mode?: string;
  readonly ignore?: readonly string[];
} & Record<string, unknown>;

const readHeadPolicy: () => unknown = readHeadPolicyFile;
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

const JSCPD_MODES: readonly string[] = ['strict', 'mild', 'weak'];
const JSCPD_SIZE = /^(\d+(?:\.\d+)?)\s*(b|kb?|mb?|gb?)?$/iu;
const AT_LEAST_ONE = 'a whole number of 1 or more';
function isPositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
function isRegex(entry: string): { valid: boolean } {
  try {
    return { valid: new RegExp(entry, 'u').source !== '' };
  } catch {
    return { valid: false };
  }
}
const JSCPD_PROJECT_KEYS: Record<ProjectKey, Check> = {
  minTokens: [isPositive, AT_LEAST_ONE],
  minLines: [isPositive, AT_LEAST_ONE],
  maxLines: [isPositive, AT_LEAST_ONE],
  maxSize: [
    (value: unknown) => typeof value === 'string' && JSCPD_SIZE.test(value),
    'a size string such as "100kb" or "1mb"',
  ],
  mode: [
    (value: unknown) => JSCPD_MODES.some((mode) => mode === value),
    `one of ${JSCPD_MODES.join(', ')}`,
  ],
  skipComments: [(value: unknown) => typeof value === 'boolean', 'true or false'],
  ignore: [isStringList, 'a list of file globs such as "src/legacy/**"'],
  ignorePattern: [
    (value: unknown) => isStringList(value) && value.every((entry) => isRegex(entry).valid),
    'a list of regular expressions for code to skip',
  ],
  ignoreCase: [(value: unknown) => typeof value === 'boolean', 'true or false'],
};
function isProjectKey(key: string): key is ProjectKey {
  return Object.hasOwn(JSCPD_PROJECT_KEYS, key);
}

function projectFile(projectRoot: string): string {
  const file = path.join(projectRoot, JSCPD_PROJECT_FILE);
  if (!existsSync(file)) {
    throw new Error(missingProjectConfig('jscpd', JSCPD_PROJECT_FILE));
  }
  if (!isRealPathInside(projectRoot, file)) {
    throw new Error(`${JSCPD_PROJECT_FILE} must stay inside the project`);
  }
  return file;
}

function parsedJson(text: string): unknown {
  try {
    return parseJson(text);
  } catch (error) {
    throw new Error(
      `${JSCPD_PROJECT_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function checkedValue(key: ProjectKey, value: unknown): unknown {
  const [accepts, expected] = JSCPD_PROJECT_KEYS[key];
  if (!accepts(value)) {
    throw new Error(`${JSCPD_PROJECT_FILE} ${key} must be ${expected}`);
  }
  return value;
}

function withCommentMode({ skipComments, ...config }: ProjectConfig): ProjectConfig {
  return skipComments === true && config['mode'] === undefined
    ? { ...config, mode: 'weak' }
    : config;
}

function parsedProjectConfig(text: string): ProjectConfig {
  const parsed = parsedJson(text);
  if (!isPlainObject(parsed)) {
    throw new Error(`${JSCPD_PROJECT_FILE} must contain a JSON object`);
  }
  return withCommentMode(
    Object.fromEntries(
      Object.keys(parsed)
        .filter(isProjectKey)
        .toSorted()
        .map((key) => [key, checkedValue(key, parsed[key])]),
    ),
  );
}

export function resolveJscpdPolicy(settings: unknown, projectRoot: string): unknown {
  if (!listOf(fieldOf(settings, 'precedence')).includes('project')) {
    return settings;
  }
  const projectConfig = parsedProjectConfig(readFileSync(projectFile(projectRoot), 'utf8'));
  return {
    ...fieldsOf(settings),
    projectConfig,
    projectConfigDigest: createHash('sha256').update(JSON.stringify(projectConfig)).digest('hex'),
  };
}

function detectionKeys(config: unknown, keep: boolean): ProjectConfig {
  return Object.fromEntries(
    Object.entries(fieldsOf(config)).filter(([key]) => isProjectKey(key) === keep),
  );
}

export function layeredJscpdConfig(
  base: object,
  settings: unknown = fieldOf(fieldOf(readHeadPolicy(), 'tools'), 'jscpd'),
): JscpdSettings {
  const precedence = fieldOf(settings, 'precedence');
  const layers: readonly unknown[] = Array.isArray(precedence) ? precedence : ['nitpicker'];
  const projectConfig = fieldOf(settings, 'projectConfig');
  if (layers.includes('project') && !isPlainObject(projectConfig)) {
    throw new Error(`Missing head ${JSCPD_PROJECT_FILE} configuration in the policy`);
  }
  const configs = layers.map((layer) => (layer === 'nitpicker' ? base : projectConfig));
  const ignore = [
    ...new Set(
      [
        listOf(fieldOf(base, 'ignore')),
        ...configs.map((config) => listOf(fieldOf(config, 'ignore'))),
      ]
        .flat()
        .filter(isText),
    ),
  ];
  return {
    ...detectionKeys(base, false),
    ...Object.fromEntries(
      configs.toReversed().flatMap((layer) => Object.entries(detectionKeys(layer, true))),
    ),
    ...(ignore.length === 0 ? {} : { ignore }),
  };
}

export function renamedJscpdSettings(
  settings: JscpdSettings,
  renamed: { readonly minTokens: number; readonly minLines: number },
): JscpdSettings {
  return {
    ...settings,
    ...renamed,
    minTokens: Math.max(renamed.minTokens, settings.minTokens ?? 0),
    minLines: Math.max(renamed.minLines, settings.minLines ?? 0),
  };
}
