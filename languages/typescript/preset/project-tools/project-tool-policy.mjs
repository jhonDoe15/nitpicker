import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPlainObject, picked } from '../../../../shared/config.mjs';
import { realFileInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { parsedJsonc } from '../../../../shared/jsonc/jsonc.mjs';
import { loadInChild, loaderScript } from '../project-configs/config-module.mjs';
import {
  encodedValue,
  withDependencyCruiserFiles,
  withoutKnipCompilers,
} from './config-values.mjs';
import {
  isProjectConfigTool,
  isProjectToolNeeded,
  jsonReading,
  lookedFor,
  packageJsonKey,
  projectConfigSources,
} from './project-config-files.mjs';

const LOADER = pathToFileURL(path.join(import.meta.dirname, 'config-loader.mjs')).href;
const LOADER_SCRIPT = loaderScript(
  `const { loadToolConfig } = await import(${JSON.stringify(LOADER)});`,
  'report({ value: await loadToolConfig(process.argv[1], process.argv[2]) });',
);
const CAPTURED_FACTS = ['projectConfig', 'projectConfigDigest', 'projectConfigError'];
const NORMALIZED = new Map([
  ['knip', withoutKnipCompilers],
  ['dependency-cruiser', withDependencyCruiserFiles],
]);

function normalized(tool, config, projectRoot) {
  return (NORMALIZED.get(tool) ?? ((value) => value))(config, projectRoot);
}

function spawnedConfig(tool, projectRoot, { full, file, timeout }) {
  return loadInChild({
    script: LOADER_SCRIPT,
    args: [tool, full],
    name: file,
    projectRoot,
    timeoutMs: timeout,
  });
}

function inProcessConfig(tool, projectRoot, { full, file }) {
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
  if (isPlainObject(parsed.value) && parsed.value.extends !== undefined) {
    return undefined;
  }
  return { config: encodedValue(normalized(tool, parsed.value, projectRoot), file) };
}

function objectConfig(value, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must hold an object`);
  }
  return value;
}

function fileConfig(tool, projectRoot, { file, timeout }) {
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

function sectionConfig(tool, projectRoot, section) {
  if (section.kind !== 'json') {
    throw new Error(`package.json is not valid JSON: ${section.reason}`);
  }
  if (section.value === undefined) {
    return {};
  }
  const label = `the "${packageJsonKey(tool)}" key in package.json`;
  return objectConfig(
    encodedValue(normalized(tool, section.value, projectRoot), 'package.json'),
    label,
  );
}

function loadedConfig(tool, projectRoot, { sources, timeout }) {
  return {
    ...sectionConfig(tool, projectRoot, sources.section),
    ...(sources.file === undefined
      ? {}
      : fileConfig(tool, projectRoot, { file: sources.file, timeout })),
  };
}

export function evaluatedProjectConfig(tool, projectRoot, timeout) {
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

function captured(tool, projectRoot, timeout) {
  const evaluated = evaluatedProjectConfig(tool, projectRoot, timeout);
  const capture =
    evaluated.kind === 'config'
      ? { projectConfig: evaluated.config }
      : { projectConfigError: evaluated.message };
  const digest = createHash('sha256').update(JSON.stringify(capture)).digest('hex');
  return { ...capture, projectConfigDigest: digest };
}

function usesProject(settings) {
  return precedenceLayers(settings?.precedence).usesProject;
}

export function withProjectToolConfigs(tools, projectRoot, options = {}) {
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

export function headCapturedFacts(settings, headSettings = {}) {
  const facts = picked(headSettings, CAPTURED_FACTS);
  if (facts.projectConfig === undefined && facts.projectConfigError === undefined) {
    return { ...headSettings, precedence: headSettings.precedence ?? ['nitpicker'] };
  }
  return { ...settings, ...facts };
}

export function projectToolLayer(tool, settings) {
  if (!usesProject(settings)) {
    return undefined;
  }
  if (settings.projectConfigError !== undefined) {
    throw new Error(settings.projectConfigError);
  }
  if (!isPlainObject(settings.projectConfig)) {
    throw new Error(`The head policy holds no project ${tool} config`);
  }
  return { precedence: settings.precedence, config: settings.projectConfig };
}
