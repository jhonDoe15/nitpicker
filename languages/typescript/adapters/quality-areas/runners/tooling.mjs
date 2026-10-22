import {
  PACKAGE_ROOT,
  toolNameForPath,
  resolveTool,
} from '../../../../../core/tooling/tool-resolution.mjs';
import { loadDependencyGraph } from '../../dependency-graph/project-dependency-graph.mjs';
import { existingRoots } from '../../../preset/layout.mjs';
import { EXCLUDED_PATH_PATTERN } from '../../../preset/dependency-graph/cruise.mjs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { lstatSync } from 'node:fs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

export const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;

export function runDependencyCruiser(options, layout) {
  const report = loadDependencyGraph({
    projectRoot: options.projectRoot,
    policyRoot: options.policyRoot,
    liveProjectRoot: options.liveProjectRoot,
    patterns: existingRoots(options.projectRoot, layout.graphRoots),
    exclude: EXCLUDED_PATH_PATTERN,
  });
  if (!Array.isArray(report.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return report;
}

export function runNodeTool({ acceptedStatuses, ...invocation }) {
  const result = spawnNodeTool(invocation);
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${invocation.options.kind} exited with ${String(result.status)}: ${detail}`);
  }
  return result;
}

function nodeToolPaths(options, { relativeToolPath, absoluteToolPath }) {
  if (absoluteToolPath !== undefined) {
    return [absoluteToolPath];
  }
  if (relativeToolPath === undefined) {
    return [];
  }
  const name = toolNameForPath(relativeToolPath);
  const bin = relativeToolPath.slice(name.length + 1);
  return [resolveTool(name, { projectRoot: options.liveProjectRoot, bin }).binPath];
}

export function spawnNodeTool({
  options,
  relativeToolPath,
  absoluteToolPath,
  arguments_,
  nodeArguments = [],
  cwd = options.projectRoot,
  environment = {},
}) {
  const toolPaths = nodeToolPaths(options, { relativeToolPath, absoluteToolPath });
  const result = spawnSync(process.execPath, [...nodeArguments, ...toolPaths, ...arguments_], {
    cwd,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
}

export async function importPolicyModule(options, relativePath, suffix = '') {
  return import(`${pathToFileURL(path.join(options.policyRoot, relativePath)).href}${suffix}`);
}

export function policyFile(policyRoot, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError('Mutation companion config must be a relative path');
  }
  const filePath = path.resolve(policyRoot, relativePath);
  const relativeToPolicy = path.relative(policyRoot, filePath);
  if (
    relativeToPolicy === '..' ||
    relativeToPolicy.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToPolicy) ||
    !lstatSync(filePath).isFile()
  ) {
    throw new Error(`Mutation companion config must stay within the policy root: ${relativePath}`);
  }
  return filePath;
}

export function relativeProjectPath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replaceAll('\\', '/');
}

export function parseReportJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid quality area JSON report', { cause: error });
  }
}
