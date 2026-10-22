import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../shared/config.mjs';
import { missingProjectConfig } from '../../../shared/conventions/tool-precedence.mjs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';

export const JSCPD_PROJECT_FILE = '.jscpd.json';
const JSCPD_PROJECT_KEYS = [
  'minTokens',
  'minLines',
  'maxLines',
  'maxSize',
  'mode',
  'skipComments',
  'ignore',
  'ignorePattern',
  'ignoreCase',
];

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

function parsedProjectConfig(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${JSCPD_PROJECT_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${JSCPD_PROJECT_FILE} must contain a JSON object`);
  }
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => JSCPD_PROJECT_KEYS.includes(key)),
  );
}

export function resolveJscpdPolicy(settings, projectRoot) {
  if (!settings?.precedence?.includes('project')) {
    return settings;
  }
  const text = readFileSync(projectFile(projectRoot), 'utf8');
  return {
    ...settings,
    projectConfig: parsedProjectConfig(text),
    projectConfigDigest: createHash('sha256').update(text).digest('hex'),
  };
}

function listOf(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function detectionKeys(config, keep) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => JSCPD_PROJECT_KEYS.includes(key) === keep),
  );
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
    ...configs
      .toReversed()
      .reduce((config, layer) => ({ ...config, ...detectionKeys(layer, true) }), {}),
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
