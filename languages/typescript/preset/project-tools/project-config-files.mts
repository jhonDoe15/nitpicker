import { existsSync } from 'node:fs';
import { fieldOf, isPlainObject } from '../../../../shared/values/readers.mts';
import { parsedJsonc, readRealInside, resolveInside } from './typed/shared-views.mts';
import type { JsoncResult, ProjectConfigSources, ToolEntry } from './typed/tool-types.mts';

export const KNIP_TOOL = 'knip';
export const DEPENDENCY_CRUISER_TOOL = 'dependency-cruiser';

const PACKAGE_JSON = 'package.json';

const TOOLS = new Map<string, ToolEntry>([
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
  ...[
    'config-loader.mjs',
    'config-values.mjs',
    'dependency-cruiser-loader.mjs',
    'project-config-files.mjs',
    'project-tool-policy.mjs',
  ].map((name) => `languages/typescript/preset/project-tools/${name}`),
  'languages/typescript/preset/project-configs/config-module.mjs',
  'core/tooling/host-environment.mjs',
];

export function projectConfigTools(): string[] {
  return [...TOOLS.keys()];
}

export function isProjectConfigTool(tool: string): boolean {
  return TOOLS.has(tool);
}

export function packageJsonKey(tool: string): string | undefined {
  return TOOLS.get(tool)?.packageKey;
}

export function jsonReading(tool: string, file: string): { strict: boolean } | undefined {
  const json = TOOLS.get(tool)?.json;
  return json !== undefined && json.pattern.test(file) ? { strict: json.strict } : undefined;
}

export function isProjectToolNeeded(tool: string, disabled: readonly string[] = []): boolean {
  return (TOOLS.get(tool)?.analyzers ?? []).some((analyzer) => !disabled.includes(analyzer));
}

export function projectConfigCandidates(tool: string): string[] {
  const key = packageJsonKey(tool);
  return [...(TOOLS.get(tool)?.files ?? []), ...(key === undefined ? [] : [PACKAGE_JSON])];
}

export function manifestSection(text: string, key: string): JsoncResult {
  const parsed = parsedJsonc(text);
  if (parsed.kind !== 'json') {
    return { kind: 'malformed', reason: parsed.reason };
  }
  return {
    kind: 'json',
    value: isPlainObject(parsed.value) ? fieldOf(parsed.value, key) : undefined,
  };
}

function packageJsonSection(projectRoot: string, key: string | undefined): JsoncResult {
  if (key === undefined) {
    return { kind: 'json', value: undefined };
  }
  const text = readRealInside(projectRoot, PACKAGE_JSON);
  return text === undefined ? { kind: 'json', value: undefined } : manifestSection(text, key);
}

function isFileInside(projectRoot: string, name: string): boolean {
  const full = resolveInside(projectRoot, name);
  return full !== undefined && existsSync(full);
}

export function projectConfigSources(
  tool: string,
  projectRoot: string,
): ProjectConfigSources | undefined {
  const file = (TOOLS.get(tool)?.files ?? []).find((name) => isFileInside(projectRoot, name));
  const key = packageJsonKey(tool);
  const section = packageJsonSection(projectRoot, key);
  const labels = [
    ...(file === undefined ? [] : [file]),
    ...(section.value === undefined ? [] : [`the "${String(key)}" key in ${PACKAGE_JSON}`]),
  ];
  return labels.length === 0 ? undefined : { file, section, label: labels.join(' and ') };
}

export function lookedFor(tool: string): string {
  const key = packageJsonKey(tool);
  const files = (TOOLS.get(tool)?.files ?? []).join(', ');
  return `a ${tool} config (${files}${key === undefined ? '' : `, or the "${key}" key in ${PACKAGE_JSON}`})`;
}
