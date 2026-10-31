import { spawnSyncWithOutputFile } from '../../../../core/tooling/output-file.mjs';
import { createHash } from 'node:crypto';
import { statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildOnce, TransientBuildError } from '../../../../core/tooling/build-once/build-once.mjs';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { trackTemporaryPath } from '../../../../core/tooling/temporary-files.mjs';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { ARCHITECTURE_CONFIG } from '../../preset/dependency-graph/cruise.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { revivedExpression } from '../../preset/project-tools/config-values.mjs';
import { layoutTransformFor } from '../../preset/tool-configs.mjs';
import { projectExcludePaths } from './project-config/dependency-cruiser-layers.mjs';
import { projectGraphLayer } from './project-config/graph-layer.mjs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const TSCONFIG_NAME = 'tsconfig.quality.json';
const LAYERS_MODULE = pathToFileURL(
  path.join(import.meta.dirname, 'project-config', 'dependency-cruiser-layers.mjs'),
).href;

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
  reportsConfigErrors,
}) {
  const projectLayer = projectGraphLayer({ reportsConfigErrors });
  const requested = [exclude, ...projectExcludePaths(projectLayer)].filter(
    (pattern) => pattern !== undefined && pattern.length > 0,
  );
  return {
    projectRoot,
    projectLayer,
    patterns,
    includeOnly,
    policyConfig: policyPath(policyRoot, configRelativePath),
    policyTypeScriptConfig: policyPath(
      policyRoot,
      path.posix.join(path.posix.dirname(configRelativePath), TSCONFIG_NAME),
    ),
    exclusion: graphExclusion(
      requested.length === 0 ? undefined : requested.join('|'),
      readLayout().excludePattern,
    ),
    tool: resolveTool('dependency-cruiser', {
      projectRoot: liveProjectRoot,
      bin: 'bin/dependency-cruise.mjs',
    }).binPath,
  };
}

function graphExclusion(requested, layoutPattern) {
  const layoutAlreadyIncluded = layoutPattern !== undefined && requested?.includes(layoutPattern);
  return [requested, layoutAlreadyIncluded ? undefined : layoutPattern]
    .filter((pattern) => pattern !== undefined)
    .join('|');
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
    cruise.projectLayer,
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 32);
}

function runCruise(cruise) {
  const wrapper = installWrapperConfig(cruise);
  try {
    const result = spawnSyncWithOutputFile(
      process.execPath,
      cruiseArguments(cruise, wrapper.path),
      {
        cwd: cruise.projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
      },
    );
    assertCruised(result);
    return result.stdout;
  } finally {
    wrapper.remove();
  }
}

function assertCruised(result) {
  if (result.error !== undefined) {
    throw result.error;
  }
  if (typeof result.signal === 'string') {
    throw new TransientBuildError(`dependency-cruiser was terminated by ${result.signal}`);
  }
  if (
    ![0, 1].includes(result.status) ||
    (result.status === 1 && parseJson(result.stdout).error !== undefined)
  ) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`dependency-cruiser exited with ${String(result.status)}: ${detail}`);
  }
}

function parseJson(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error };
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
    writeFileSync(wrapperPath, wrapperSource(cruise, typeScriptConfig.targetPath), {
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

function layeredImports({ policyConfig, projectLayer }) {
  const policy = `import policy from ${JSON.stringify(pathToFileURL(policyConfig).href)};`;
  if (projectLayer === undefined) {
    return [policy, 'const config = policy;'];
  }
  return [
    policy,
    `import { layeredDependencyCruiserConfig } from ${JSON.stringify(LAYERS_MODULE)};`,
    `const config = layeredDependencyCruiserConfig(policy, ${revivedExpression(projectLayer)});`,
  ];
}

function wrapperSource(cruise, typeScriptConfig) {
  return [
    ...layeredImports(cruise),
    'export default {',
    '  ...config,',
    '  options: {',
    '    ...config.options,',
    `    tsConfig: { ...config.options?.tsConfig, fileName: ${JSON.stringify(typeScriptConfig)} },`,
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
