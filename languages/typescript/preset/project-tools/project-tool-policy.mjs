import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { encodedValue } from './config-values.mjs';
import { PROJECT_CONFIG_FILES, lookedFor, projectConfigSources } from './project-config-files.mjs';

const LOADER_SCRIPT = path.join(import.meta.dirname, 'load-config-script.mjs');
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function loadedFile(tool, projectRoot, file) {
  const result = spawnSync(process.execPath, [LOADER_SCRIPT, tool, path.join(projectRoot, file)], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `the loader exited with ${String(result.status)}`);
  }
  return JSON.parse(result.stdout);
}

function objectConfig(value, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must hold an object`);
  }
  return value;
}

function loadedConfig(tool, projectRoot, { file, section }) {
  return {
    ...(section === undefined
      ? {}
      : objectConfig(encodedValue(section, 'package.json'), 'package.json')),
    ...(file === undefined ? {} : objectConfig(loadedFile(tool, projectRoot, file), file)),
  };
}

function withDigest(capture) {
  const digest = createHash('sha256').update(JSON.stringify(capture)).digest('hex');
  return { ...capture, projectConfigDigest: digest };
}

function captured(tool, projectRoot) {
  const sources = projectConfigSources(tool, projectRoot);
  if (sources === undefined) {
    return withDigest({ projectConfigError: missingProjectConfig(tool, lookedFor(tool)) });
  }
  try {
    const projectConfig = loadedConfig(tool, projectRoot, sources);
    return withDigest({ projectConfigFile: sources.label, projectConfig });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return withDigest({
      projectConfigFile: sources.label,
      projectConfigError: `Could not read the project's ${tool} config (${sources.label}): ${reason}`,
    });
  }
}

function usesProject(settings) {
  return precedenceLayers(settings?.precedence).usesProject;
}

export function withProjectToolConfigs(tools, projectRoot) {
  if (tools === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => [
      tool,
      PROJECT_CONFIG_FILES.has(tool) && usesProject(settings)
        ? { ...settings, ...captured(tool, projectRoot) }
        : settings,
    ]),
  );
}

export function headProjectToolFacts(tools = {}, headTools = {}) {
  return Object.fromEntries(
    [...new Set([...Object.keys(tools), ...Object.keys(headTools)])].flatMap((tool) => {
      if (!PROJECT_CONFIG_FILES.has(tool)) {
        return tools[tool] === undefined ? [] : [[tool, tools[tool]]];
      }
      return headTools[tool] === undefined ? [] : [[tool, headTools[tool]]];
    }),
  );
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
