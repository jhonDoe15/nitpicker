import { existsSync } from 'node:fs';
import { isPlainObject } from '../../../../shared/config.mjs';
import { readRealInside, resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { parsedJsonc } from '../../../../shared/jsonc/jsonc.mjs';

export const KNIP_TOOL = 'knip';
export const DEPENDENCY_CRUISER_TOOL = 'dependency-cruiser';

const PACKAGE_JSON = 'package.json';

const TOOLS = new Map([
  [
    KNIP_TOOL,
    {
      files: [
        'knip.json',
        'knip.jsonc',
        '.knip.json',
        '.knip.jsonc',
        'knip.ts',
        'knip.js',
        'knip.config.ts',
        'knip.config.js',
      ],
      packageKey: 'knip',
      analyzers: ['dead-code'],
      json: { pattern: /\.jsonc?$/u, strict: true },
    },
  ],
  [
    DEPENDENCY_CRUISER_TOOL,
    {
      files: [
        '.dependency-cruiser.json',
        '.dependency-cruiser.js',
        '.dependency-cruiser.cjs',
        '.dependency-cruiser.mjs',
        '.dependency-cruiser.ts',
        '.dependency-cruiser.cts',
        '.dependency-cruiser.mts',
      ],
      analyzers: ['dependency-architecture', 'coupling', 'test-runtime', 'entry-points'],
      json: { pattern: /\.json$/u, strict: false },
    },
  ],
]);

export const PROJECT_TOOL_FILES = [
  'config-loader.mjs',
  'config-values.mjs',
  'dependency-cruiser-loader.mjs',
  'project-config-files.mjs',
  'project-tool-policy.mjs',
].map((name) => `languages/typescript/preset/project-tools/${name}`);

export function projectConfigTools() {
  return [...TOOLS.keys()];
}

export function isProjectConfigTool(tool) {
  return TOOLS.has(tool);
}

export function packageJsonKey(tool) {
  return TOOLS.get(tool)?.packageKey;
}

export function jsonReading(tool, file) {
  const json = TOOLS.get(tool)?.json;
  return json !== undefined && json.pattern.test(file) ? { strict: json.strict } : undefined;
}

export function isProjectToolNeeded(tool, disabled = []) {
  return (TOOLS.get(tool)?.analyzers ?? []).some((analyzer) => !disabled.includes(analyzer));
}

export function projectConfigCandidates(tool) {
  const key = packageJsonKey(tool);
  return [...(TOOLS.get(tool)?.files ?? []), ...(key === undefined ? [] : [PACKAGE_JSON])];
}

export function manifestSection(text, key) {
  const parsed = parsedJsonc(text);
  if (parsed.kind !== 'json') {
    return { kind: 'malformed', reason: parsed.reason };
  }
  return { kind: 'json', value: isPlainObject(parsed.value) ? parsed.value[key] : undefined };
}

function packageJsonSection(projectRoot, key) {
  const text = key === undefined ? undefined : readRealInside(projectRoot, PACKAGE_JSON, 'utf8');
  return text === undefined ? { kind: 'json', value: undefined } : manifestSection(text, key);
}

function isFileInside(projectRoot, name) {
  const full = resolveInside(projectRoot, name);
  return full !== undefined && existsSync(full);
}

export function projectConfigSources(tool, projectRoot) {
  const file = (TOOLS.get(tool)?.files ?? []).find((name) => isFileInside(projectRoot, name));
  const key = packageJsonKey(tool);
  const section = packageJsonSection(projectRoot, key);
  const labels = [
    ...(file === undefined ? [] : [file]),
    ...(section.value === undefined ? [] : [`the "${key}" key in ${PACKAGE_JSON}`]),
  ];
  return labels.length === 0 ? undefined : { file, section, label: labels.join(' and ') };
}

export function lookedFor(tool) {
  const key = packageJsonKey(tool);
  const files = (TOOLS.get(tool)?.files ?? []).join(', ');
  return `a ${tool} config (${files}${key === undefined ? '' : `, or the "${key}" key in ${PACKAGE_JSON}`})`;
}
