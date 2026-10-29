import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';

export const KNIP_TOOL = 'knip';
export const DEPENDENCY_CRUISER_TOOL = 'dependency-cruiser';

const PACKAGE_JSON = 'package.json';

const CONFIG_FILES = new Map([
  [
    KNIP_TOOL,
    [
      'knip.json',
      'knip.jsonc',
      '.knip.json',
      '.knip.jsonc',
      'knip.ts',
      'knip.js',
      'knip.config.ts',
      'knip.config.js',
    ],
  ],
  [
    DEPENDENCY_CRUISER_TOOL,
    [
      '.dependency-cruiser.json',
      '.dependency-cruiser.js',
      '.dependency-cruiser.cjs',
      '.dependency-cruiser.mjs',
      '.dependency-cruiser.ts',
      '.dependency-cruiser.cts',
      '.dependency-cruiser.mts',
    ],
  ],
]);

export const PROJECT_TOOL_FILES = [
  'config-loader.mjs',
  'config-values.mjs',
  'project-config-files.mjs',
  'project-tool-policy.mjs',
].map((name) => `languages/typescript/preset/project-tools/${name}`);

const PACKAGE_JSON_KEYS = new Map([[KNIP_TOOL, 'knip']]);

export function projectConfigTools() {
  return [...CONFIG_FILES.keys()];
}

export function isProjectConfigTool(tool) {
  return CONFIG_FILES.has(tool);
}

export function packageJsonKey(tool) {
  return PACKAGE_JSON_KEYS.get(tool);
}

export function projectConfigCandidates(tool) {
  return [
    ...(CONFIG_FILES.get(tool) ?? []),
    ...(PACKAGE_JSON_KEYS.has(tool) ? [PACKAGE_JSON] : []),
  ];
}

function parsedManifest(file) {
  try {
    return { kind: 'json', value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function packageJsonSection(projectRoot, key) {
  const file = path.join(projectRoot, PACKAGE_JSON);
  if (key === undefined || !existsSync(file)) {
    return undefined;
  }
  const parsed = parsedManifest(file);
  return parsed.kind === 'json' && isPlainObject(parsed.value) ? parsed.value[key] : undefined;
}

function isFileInside(projectRoot, name) {
  const full = resolveInside(projectRoot, name);
  return full !== undefined && existsSync(full);
}

export function projectConfigSources(tool, projectRoot) {
  const file = (CONFIG_FILES.get(tool) ?? []).find((name) => isFileInside(projectRoot, name));
  const key = PACKAGE_JSON_KEYS.get(tool);
  const section = packageJsonSection(projectRoot, key);
  const labels = [
    ...(file === undefined ? [] : [file]),
    ...(section === undefined ? [] : [`the "${key}" key in ${PACKAGE_JSON}`]),
  ];
  return labels.length === 0 ? undefined : { file, section, label: labels.join(' and ') };
}

export function lookedFor(tool) {
  const key = PACKAGE_JSON_KEYS.get(tool);
  const files = (CONFIG_FILES.get(tool) ?? []).join(', ');
  return `a ${tool} config (${files}${key === undefined ? '' : `, or the "${key}" key in ${PACKAGE_JSON}`})`;
}
