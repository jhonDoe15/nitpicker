import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../shared/config.mjs';
import {
  JSCPD_PROJECT_FILE,
  missingProjectConfig,
} from '../../../shared/conventions/tool-precedence.mjs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';

export const JSCPD_MODES = ['strict', 'mild', 'weak'];
export const JSCPD_SIZE = /^(\d+(?:\.\d+)?)\s*(b|kb?|mb?|gb?)?$/iu;
const AT_LEAST_ONE = 'a whole number of 1 or more';
function isPositive(value) {
  return Number.isInteger(value) && value >= 1;
}
function isStringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
function isRegex(entry) {
  try {
    return { valid: new RegExp(entry, 'u').source !== '' };
  } catch {
    return { valid: false };
  }
}
const JSCPD_PROJECT_KEYS = {
  minTokens: [isPositive, AT_LEAST_ONE],
  minLines: [isPositive, AT_LEAST_ONE],
  maxLines: [isPositive, AT_LEAST_ONE],
  maxSize: [
    (value) => typeof value === 'string' && JSCPD_SIZE.test(value),
    'a size string such as "100kb" or "1mb"',
  ],
  mode: [(value) => JSCPD_MODES.includes(value), `one of ${JSCPD_MODES.join(', ')}`],
  skipComments: [(value) => typeof value === 'boolean', 'true or false'],
  ignore: [isStringList, 'a list of file globs such as "src/legacy/**"'],
  ignorePattern: [
    (value) => isStringList(value) && value.every((entry) => isRegex(entry).valid),
    'a list of regular expressions for code to skip',
  ],
  ignoreCase: [(value) => typeof value === 'boolean', 'true or false'],
};
function isProjectKey(key) {
  return Object.hasOwn(JSCPD_PROJECT_KEYS, key);
}

function projectFile(projectRoot) {
  const file = path.join(projectRoot, JSCPD_PROJECT_FILE);
  if (!existsSync(file)) {
    throw new Error(missingProjectConfig('jscpd', JSCPD_PROJECT_FILE));
  }
  const relative = path.relative(realpathSync(projectRoot), realpathSync(file));
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`${JSCPD_PROJECT_FILE} must stay inside the project`);
  }
  return file;
}

function parsedJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${JSCPD_PROJECT_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function checkedValue(key, value) {
  const [accepts, expected] = JSCPD_PROJECT_KEYS[key];
  if (!accepts(value)) {
    throw new Error(`${JSCPD_PROJECT_FILE} ${key} must be ${expected}`);
  }
  return value;
}

function withCommentMode({ skipComments, ...config }) {
  return skipComments === true && config.mode === undefined ? { ...config, mode: 'weak' } : config;
}

function parsedProjectConfig(text) {
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

export function appliedJscpdConfig(text) {
  try {
    return { kind: 'applied', config: parsedProjectConfig(text) };
  } catch {
    return { kind: 'rejected' };
  }
}

export function resolveJscpdPolicy(settings, projectRoot) {
  if (!settings?.precedence?.includes('project')) {
    return settings;
  }
  const projectConfig = parsedProjectConfig(readFileSync(projectFile(projectRoot), 'utf8'));
  return {
    ...settings,
    projectConfig,
    projectConfigDigest: createHash('sha256').update(JSON.stringify(projectConfig)).digest('hex'),
  };
}

function listOf(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function detectionKeys(config, keep) {
  return Object.fromEntries(Object.entries(config).filter(([key]) => isProjectKey(key) === keep));
}

export function layeredJscpdConfig(base, settings = readHeadPolicyFile().tools?.jscpd) {
  const layers = settings?.precedence ?? ['nitpicker'];
  if (layers.includes('project') && !isPlainObject(settings.projectConfig)) {
    throw new Error(`Missing head ${JSCPD_PROJECT_FILE} configuration in the policy`);
  }
  const configs = layers.map((layer) => (layer === 'nitpicker' ? base : settings.projectConfig));
  const ignore = [
    ...new Set([listOf(base.ignore), ...configs.map(({ ignore: value }) => listOf(value))].flat()),
  ];
  return {
    ...detectionKeys(base, false),
    ...Object.fromEntries(
      configs.toReversed().flatMap((layer) => Object.entries(detectionKeys(layer, true))),
    ),
    ...(ignore.length === 0 ? {} : { ignore }),
  };
}

export function renamedJscpdSettings(settings, renamed) {
  return {
    ...settings,
    ...renamed,
    minTokens: Math.max(renamed.minTokens, settings.minTokens ?? 0),
    minLines: Math.max(renamed.minLines, settings.minLines ?? 0),
  };
}
