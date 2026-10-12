import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildOnce } from '../../../core/tooling/build-once.mjs';
import { linkPolicyFile } from '../../../core/tooling/policy-links.mjs';
import { trackTemporaryPath } from '../../../core/tooling/temporary-files.mjs';
import { resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import { ARCHITECTURE_CONFIG } from '../preset/dependency-graph/cruise.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const TSCONFIG_NAME = 'tsconfig.quality.json';

export function loadDependencyGraph(request) {
  const cruise = cruiseSpecification(request);
  const text = buildOnce(graphKey(cruise), () => runCruise(cruise));
  return parseGraph(text);
}

function cruiseSpecification({
  projectRoot,
  policyRoot,
  liveProjectRoot,
  patterns,
  exclude,
  includeOnly,
  configRelativePath = ARCHITECTURE_CONFIG,
}) {
  return {
    projectRoot,
    patterns,
    includeOnly,
    policyConfig: policyPath(policyRoot, configRelativePath),
    policyTypeScriptConfig: policyPath(
      policyRoot,
      path.posix.join(path.posix.dirname(configRelativePath), TSCONFIG_NAME),
    ),
    exclusion: [exclude, readLayout().excludePattern]
      .filter((pattern) => pattern !== undefined)
      .join('|'),
    tool: resolveTool('dependency-cruiser', {
      projectRoot: liveProjectRoot,
      bin: 'bin/dependency-cruise.mjs',
    }).binPath,
  };
}

function policyPath(policyRoot, relativePath) {
  const filePath = path.resolve(policyRoot, relativePath);
  const relativeToPolicy = path.relative(policyRoot, filePath);
  if (relativeToPolicy.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPolicy)) {
    throw new Error(`Policy path must stay within the policy root: ${relativePath}`);
  }
  if (!statSync(filePath).isFile()) {
    throw new Error(`Policy path is not a regular file: ${relativePath}`);
  }
  return filePath;
}

function graphKey(cruise) {
  const { projectRoot, patterns, includeOnly, policyConfig, policyTypeScriptConfig } = cruise;
  const identity = [
    projectRoot,
    patterns,
    includeOnly,
    policyConfig,
    policyTypeScriptConfig,
    cruise.exclusion,
    cruise.tool,
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 32);
}

function runCruise(cruise) {
  const wrapper = installWrapperConfig(cruise);
  try {
    const result = spawnSync(process.execPath, cruiseArguments(cruise, wrapper.path), {
      cwd: cruise.projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    if (![0, 1].includes(result.status)) {
      const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
      throw new Error(`dependency-cruiser exited with ${String(result.status)}: ${detail}`);
    }
    return result.stdout;
  } finally {
    wrapper.remove();
  }
}

function cruiseArguments(cruise, wrapperConfig) {
  const arguments_ = [cruise.tool, ...cruise.patterns, '--config', wrapperConfig];
  arguments_.push('--output-type', 'json');
  if (cruise.includeOnly !== undefined) {
    arguments_.push('--include-only', cruise.includeOnly);
  }
  if (cruise.exclusion.length > 0) {
    arguments_.push('--exclude', cruise.exclusion);
  }
  return arguments_;
}

function installWrapperConfig(cruise) {
  const suffix = String(process.pid);
  const wrapperPath = path.join(
    cruise.projectRoot,
    `.nitpicker-diff-dependency-cruiser-${suffix}.config.mjs`,
  );
  const typeScriptConfig = linkPolicyFile(
    cruise.policyTypeScriptConfig,
    path.join(cruise.projectRoot, `.nitpicker-diff-tsconfig-${suffix}.json`),
    layoutTransformFor(TSCONFIG_NAME, readLayout()),
  );
  trackTemporaryPath(wrapperPath);
  try {
    writeFileSync(wrapperPath, wrapperSource(cruise.policyConfig, typeScriptConfig.targetPath), {
      flag: 'wx',
    });
  } catch (error) {
    typeScriptConfig.remove();
    throw error;
  }
  return {
    path: wrapperPath,
    remove() {
      unlinkSync(wrapperPath);
      typeScriptConfig.remove();
    },
  };
}

function wrapperSource(policyConfig, typeScriptConfig) {
  return [
    `import policy from ${JSON.stringify(pathToFileURL(policyConfig).href)};`,
    'export default {',
    '  ...policy,',
    '  options: {',
    '    ...policy.options,',
    `    tsConfig: { ...policy.options?.tsConfig, fileName: ${JSON.stringify(typeScriptConfig)} },`,
    '  },',
    '};',
    '',
  ].join('\n');
}

function parseGraph(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('dependency-cruiser did not produce valid JSON', { cause: error });
  }
}
