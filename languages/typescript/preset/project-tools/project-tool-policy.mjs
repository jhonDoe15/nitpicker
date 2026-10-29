import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withoutHostCiOutputs } from '../../../../core/tooling/host-environment.mjs';
import { isPlainObject, picked } from '../../../../shared/config.mjs';
import { realFileInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { parsedJsonc } from '../../../../shared/jsonc/jsonc.mjs';
import { encodedValue, withoutKnipCompilers } from './config-values.mjs';
import {
  isJsonConfigFile,
  isProjectConfigTool,
  isProjectToolNeeded,
  lookedFor,
  packageJsonKey,
  projectConfigSources,
} from './project-config-files.mjs';

const LOADER = pathToFileURL(path.join(import.meta.dirname, 'config-loader.mjs')).href;
const LOADER_SOURCE = [
  `const { writeToolConfig } = await import(${JSON.stringify(LOADER)});`,
  'const [tool, file, resultFile] = process.argv.slice(1);',
  'await writeToolConfig({ tool, file, resultFile });',
  'process.exit(0);',
].join('\n');
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const CONFIG_LOAD_TIMEOUT_MS = 60_000;
const CAPTURED_FACTS = ['projectConfig', 'projectConfigDigest', 'projectConfigError'];
const NORMALIZED = new Map([['knip', withoutKnipCompilers]]);

function normalized(tool, config) {
  return (NORMALIZED.get(tool) ?? ((value) => value))(config);
}

function childFailure(result) {
  const detail = result.stderr.trim();
  if (detail.length > 0) {
    return detail;
  }
  const ending = result.signal === null ? `code ${String(result.status)}` : result.signal;
  return `the config exited (${ending}) before it finished loading`;
}

function childResult(result, resultFile, timeout) {
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`the config did not finish loading within ${String(timeout / 1000)} seconds`);
  }
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!existsSync(resultFile)) {
    throw new Error(childFailure(result));
  }
  const loaded = JSON.parse(readFileSync(resultFile, 'utf8'));
  if (loaded.failure !== undefined) {
    throw new Error(loaded.failure);
  }
  return loaded.config;
}

function spawnedConfig(tool, projectRoot, { full, timeout }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-config-'));
  const resultFile = path.join(directory, 'result.json');
  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', LOADER_SOURCE, tool, full, resultFile],
      {
        cwd: projectRoot,
        env: withoutHostCiOutputs(process.env),
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
      },
    );
    return childResult(result, resultFile, timeout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function jsonConfig(tool, { full, file }) {
  const parsed = parsedJsonc(readFileSync(full, 'utf8'));
  if (parsed.kind !== 'json') {
    throw new Error(`${file} is not valid JSON: ${parsed.reason}`);
  }
  return encodedValue(normalized(tool, parsed.value), file);
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
  const config = isJsonConfigFile(file)
    ? jsonConfig(tool, { full, file })
    : spawnedConfig(tool, projectRoot, { full, timeout });
  return objectConfig(config, file);
}

function sectionConfig(tool, section) {
  if (section.kind !== 'json') {
    throw new Error(`package.json is not valid JSON: ${section.reason}`);
  }
  if (section.value === undefined) {
    return {};
  }
  const label = `the "${packageJsonKey(tool)}" key in package.json`;
  return objectConfig(encodedValue(normalized(tool, section.value), 'package.json'), label);
}

function loadedConfig(tool, projectRoot, { sources, timeout }) {
  return {
    ...sectionConfig(tool, sources.section),
    ...(sources.file === undefined
      ? {}
      : fileConfig(tool, projectRoot, { file: sources.file, timeout })),
  };
}

export function evaluatedProjectConfig(tool, projectRoot, timeout = CONFIG_LOAD_TIMEOUT_MS) {
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
  const { disabled = [], timeout = CONFIG_LOAD_TIMEOUT_MS } = options;
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
