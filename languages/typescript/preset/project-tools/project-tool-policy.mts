import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, isPlainObject, textOf } from '../../../../shared/values/readers.mts';
import {
  missingProjectConfig,
  parsedJsonc,
  picked,
  precedenceLayers,
  realFileInside,
} from './typed/shared-views.mts';
import type {
  JsoncResult,
  ProjectConfigSources,
  ProjectEvaluation,
  ToolSettings,
} from './typed/tool-types.mts';
import { loadInChild, loaderScript } from '../project-configs/config-module.mts';
import {
  encodedValue,
  withDependencyCruiserFiles,
  withoutKnipCompilers,
} from './config-values.mts';
import {
  isProjectConfigTool,
  isProjectToolNeeded,
  jsonReading,
  lookedFor,
  packageJsonKey,
  projectConfigSources,
} from './project-config-files.mts';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const LOADER = pathToFileURL(
  checkoutModulePath(path.join(import.meta.dirname, 'config-loader.mjs')),
).href;
const LOADER_SCRIPT = loaderScript(
  `const { loadToolConfig } = await import(${JSON.stringify(LOADER)});`,
  'report({ value: await loadToolConfig(process.argv[1], process.argv[2]) });',
);
const CAPTURED_FACTS = ['projectConfig', 'projectConfigDigest', 'projectConfigError'];
const NORMALIZED = new Map<string, (config: unknown, root: string) => unknown>([
  ['knip', withoutKnipCompilers],
  ['dependency-cruiser', withDependencyCruiserFiles],
]);

function normalized(tool: string, config: unknown, projectRoot: string): unknown {
  return (NORMALIZED.get(tool) ?? ((value: unknown) => value))(config, projectRoot);
}

function spawnedConfig(
  tool: string,
  projectRoot: string,
  { full, file, timeout }: { full: string; file: string; timeout: number | undefined },
): unknown {
  return loadInChild({
    script: LOADER_SCRIPT,
    args: [tool, full],
    name: file,
    projectRoot,
    timeoutMs: timeout,
  });
}

function inProcessConfig(
  tool: string,
  projectRoot: string,
  { full, file }: { full: string; file: string },
): { config: unknown } | undefined {
  const reading = jsonReading(tool, file);
  if (reading === undefined) {
    return undefined;
  }
  const parsed = parsedJsonc(readFileSync(full, 'utf8'));
  if (parsed.kind !== 'json') {
    if (!reading.strict) {
      return undefined;
    }
    throw new Error(`${file} is not valid JSON: ${parsed.reason}`);
  }
  if (isPlainObject(parsed.value) && fieldOf(parsed.value, 'extends') !== undefined) {
    return undefined;
  }
  return { config: encodedValue(normalized(tool, parsed.value, projectRoot), file) };
}

function objectConfig(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must hold an object`);
  }
  return value;
}

function fileConfig(
  tool: string,
  projectRoot: string,
  { file, timeout }: { file: string; timeout: number | undefined },
): Record<string, unknown> {
  const full = realFileInside(projectRoot, file);
  if (full === undefined) {
    throw new Error(`${file} must be a file inside the project`);
  }
  const loaded = inProcessConfig(tool, projectRoot, { full, file });
  return objectConfig(
    loaded?.config ?? spawnedConfig(tool, projectRoot, { full, file, timeout }),
    file,
  );
}

function sectionConfig(
  tool: string,
  projectRoot: string,
  section: JsoncResult,
): Record<string, unknown> {
  if (section.kind !== 'json') {
    throw new Error(`package.json is not valid JSON: ${section.reason}`);
  }
  if (section.value === undefined) {
    return {};
  }
  const label = `the "${String(packageJsonKey(tool))}" key in package.json`;
  return objectConfig(
    encodedValue(normalized(tool, section.value, projectRoot), 'package.json'),
    label,
  );
}

function loadedConfig(
  tool: string,
  projectRoot: string,
  { sources, timeout }: { sources: ProjectConfigSources; timeout: number | undefined },
): Record<string, unknown> {
  return {
    ...sectionConfig(tool, projectRoot, sources.section),
    ...(sources.file === undefined
      ? {}
      : fileConfig(tool, projectRoot, { file: sources.file, timeout })),
  };
}

function evaluatedProjectConfig(
  tool: string,
  projectRoot: string,
  timeout?: number,
): ProjectEvaluation {
  const sources = projectConfigSources(tool, projectRoot);
  if (sources === undefined) {
    return { kind: 'missing', message: missingProjectConfig(tool, lookedFor(tool)) };
  }
  try {
    const config = loadedConfig(tool, projectRoot, { sources, timeout });
    const files = [
      ...(sources.file === undefined ? [] : [sources.file]),
      ...(sources.section.value === undefined ? [] : ['package.json']),
    ];
    return { kind: 'config', config, files };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      kind: 'error',
      message: `Could not read the project's ${tool} config (${sources.label}): ${reason}`,
    };
  }
}

function captured(
  tool: string,
  projectRoot: string,
  timeout: number | undefined,
): { projectConfig?: unknown; projectConfigError?: string; projectConfigDigest: string } {
  const evaluated = evaluatedProjectConfig(tool, projectRoot, timeout);
  const capture =
    evaluated.kind === 'config'
      ? { projectConfig: evaluated.config }
      : { projectConfigError: evaluated.message };
  const digest = createHash('sha256').update(JSON.stringify(capture)).digest('hex');
  return { ...capture, projectConfigDigest: digest };
}

function usesProject(settings: ToolSettings | undefined): boolean {
  return precedenceLayers(settings?.precedence).usesProject;
}

export function withProjectToolConfigs(
  tools: Readonly<Record<string, ToolSettings | undefined>> | undefined,
  projectRoot: string,
  options: { readonly disabled?: readonly string[]; readonly timeout?: number } = {},
): Record<string, ToolSettings | undefined> | undefined {
  if (tools === undefined) {
    return undefined;
  }
  const { disabled = [], timeout } = options;
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => [
      tool,
      isProjectConfigTool(tool) && usesProject(settings) && isProjectToolNeeded(tool, disabled)
        ? { ...settings, ...captured(tool, projectRoot, timeout) }
        : settings,
    ]),
  );
}

export function headCapturedFacts(
  settings: ToolSettings | undefined,
  headSettings: ToolSettings = {},
): ToolSettings {
  const facts = picked(headSettings, CAPTURED_FACTS);
  if (facts['projectConfig'] === undefined && facts['projectConfigError'] === undefined) {
    return { ...headSettings, precedence: headSettings.precedence ?? ['nitpicker'] };
  }
  return { ...settings, ...facts };
}

export function projectToolLayer(
  tool: string,
  settings: ToolSettings | undefined,
): { precedence: string[] | undefined; config: Record<string, unknown> } | undefined {
  if (settings === undefined || !usesProject(settings)) {
    return undefined;
  }
  const failure = fieldOf(settings, 'projectConfigError');
  if (failure !== undefined) {
    throw new Error(textOf(failure));
  }
  const projectConfig = fieldOf(settings, 'projectConfig');
  if (!isPlainObject(projectConfig)) {
    throw new Error(`The head policy holds no project ${tool} config`);
  }
  return { precedence: settings.precedence, config: projectConfig };
}
