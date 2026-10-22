import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';

export const KNIP_TOOL = 'knip';

const PACKAGE_JSON = 'package.json';

export const PROJECT_CONFIG_FILES = new Map([
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
]);

export const PROJECT_TOOL_FILES = [
  'config-values.mjs',
  'load-config-script.mjs',
  'project-config-files.mjs',
  'project-tool-policy.mjs',
].map((name) => `languages/typescript/preset/project-tools/${name}`);

export const PACKAGE_JSON_KEYS = new Map([[KNIP_TOOL, 'knip']]);

export function projectConfigCandidates(tool) {
  return [
    ...(PROJECT_CONFIG_FILES.get(tool) ?? []),
    ...(PACKAGE_JSON_KEYS.has(tool) ? [PACKAGE_JSON] : []),
  ];
}

function packageJsonSection(projectRoot, key) {
  const file = path.join(projectRoot, PACKAGE_JSON);
  if (key === undefined || !existsSync(file)) {
    return undefined;
  }
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    return isPlainObject(manifest) && manifest[key] !== undefined ? manifest[key] : undefined;
  } catch {
    return undefined;
  }
}

export function projectConfigSources(tool, projectRoot) {
  const file = (PROJECT_CONFIG_FILES.get(tool) ?? []).find((name) =>
    existsSync(path.join(projectRoot, name)),
  );
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
  const files = (PROJECT_CONFIG_FILES.get(tool) ?? []).join(', ');
  return `a ${tool} config (${files}${key === undefined ? '' : `, or the "${key}" key in ${PACKAGE_JSON}`})`;
}
