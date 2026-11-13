import { createHash } from 'node:crypto';
import { statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildOnce as untypedBuildOnce,
  TransientBuildError,
} from '../../../../core/tooling/build-once/build-once.mjs';
import {
  linkPolicyFile,
  spawnSyncWithOutputFile,
  toolBinaryPath,
  trackTemporaryPath,
} from '../typed/tooling.mts';
import {
  ARCHITECTURE_CONFIG,
  dependencyGraphTsconfig as untypedDependencyGraphTsconfig,
} from '../../preset/dependency-graph/cruise.mjs';
import { readLayout as readUntypedLayout } from '../../preset/head-policy.mjs';
import { revivedExpression as untypedRevivedExpression } from '../../preset/project-tools/config-values.mjs';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { textOf } from '../../../../shared/values/readers.mts';
import {
  type GraphLayer,
  projectExcludePaths,
} from './project-config/dependency-cruiser-layers.mts';
import { projectGraphLayer } from './project-config/graph-layer.mts';
import { TOOL_RUN_CEILING_MS } from '../../../../shared/processes/deadlines.mjs';
import type { SpawnSyncReturns } from 'node:child_process';

export type CruiseViolation = {
  readonly rule?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly type?: unknown;
  readonly cycle?: unknown;
  readonly via?: unknown;
};

export type CruiseSummary = {
  readonly violations?: unknown;
  readonly ruleSetUsed?: {
    readonly forbidden?: readonly unknown[];
    readonly required?: readonly unknown[];
  };
};

export type CruiseReport = { readonly summary?: CruiseSummary; readonly modules?: unknown };

export type DependencyGraphRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly liveProjectRoot?: string;
  readonly patterns: readonly string[];
  readonly exclude: string | undefined;
  readonly includeOnly?: string | undefined;
  readonly configRelativePath?: string;
  readonly reportsConfigErrors?: unknown;
};

type Cruise = {
  readonly projectRoot: string;
  readonly projectLayer: GraphLayer | undefined;
  readonly patterns: readonly string[];
  readonly includeOnly: string | undefined;
  readonly policyConfig: string;
  readonly policyTypeScriptConfig: string;
  readonly exclusion: string;
  readonly tool: string;
};

const buildOnce: (key: string, build: () => string) => string = untypedBuildOnce;
const dependencyGraphTsconfig: (layout: unknown) => unknown = untypedDependencyGraphTsconfig;
const readLayout: () => { readonly excludePattern?: string } = readUntypedLayout;
const revivedExpression: (value: unknown) => string = untypedRevivedExpression;

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const TSCONFIG_NAME = 'tsconfig.quality.json';
const LAYERS_MODULE = checkoutModuleUrl(
  pathToFileURL(path.join(import.meta.dirname, 'project-config', 'dependency-cruiser-layers.mjs')),
).href;

export function loadDependencyGraph(request: DependencyGraphRequest): CruiseReport {
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
}: DependencyGraphRequest): Cruise {
  const projectLayer = projectGraphLayer({ reportsConfigErrors });
  const requested = [exclude, ...projectExcludePaths(projectLayer)].filter(
    (pattern) => pattern !== undefined && textOf(pattern).length > 0,
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
    tool: toolBinaryPath('dependency-cruiser', {
      ...(liveProjectRoot === undefined ? {} : { projectRoot: liveProjectRoot }),
      bin: 'bin/dependency-cruise.mjs',
    }),
  };
}

function graphExclusion(requested: string | undefined, layoutPattern: string | undefined): string {
  const layoutAlreadyIncluded = layoutPattern !== undefined && requested?.includes(layoutPattern);
  return [requested, layoutAlreadyIncluded ? undefined : layoutPattern]
    .filter((pattern) => pattern !== undefined)
    .join('|');
}

function policyPath(policyRoot: string, relativePath: string): string {
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

function graphKey(cruise: Cruise): string {
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

function runCruise(cruise: Cruise): string {
  const wrapper = installWrapperConfig(cruise);
  try {
    const result = spawnSyncWithOutputFile(
      process.execPath,
      cruiseArguments(cruise, wrapper.path),
      {
        cwd: cruise.projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: TOOL_RUN_CEILING_MS,
      },
    );
    assertCruised(result);
    return result.stdout;
  } finally {
    wrapper.remove();
  }
}

function assertCruised(result: SpawnSyncReturns<string>): void {
  if (result.error !== undefined) {
    throw result.error;
  }
  if (typeof result.signal === 'string') {
    throw new TransientBuildError(`dependency-cruiser was terminated by ${result.signal}`);
  }
  if (
    !(result.status === 0 || result.status === 1) ||
    (result.status === 1 && 'error' in parseJson(result.stdout))
  ) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`dependency-cruiser exited with ${String(result.status)}: ${detail}`);
  }
}

function parseJson(text: string): { readonly value: unknown } | { readonly error: unknown } {
  try {
    const value: unknown = JSON.parse(text);
    return { value };
  } catch (error) {
    return { error };
  }
}

function cruiseArguments(cruise: Cruise, wrapperConfig: string): string[] {
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

function installWrapperConfig(cruise: Cruise): { readonly path: string; remove(): void } {
  const suffix = String(process.pid);
  const wrapperPath = path.join(
    cruise.projectRoot,
    `.nitpicker-diff-dependency-cruiser-${suffix}.config.mjs`,
  );
  const typeScriptConfig = linkPolicyFile(
    cruise.policyTypeScriptConfig,
    path.join(cruise.projectRoot, `.nitpicker-diff-tsconfig-${suffix}.json`),
    dependencyGraphTsconfig(readLayout()),
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

function layeredImports({ policyConfig, projectLayer }: Cruise): string[] {
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

function wrapperSource(cruise: Cruise, typeScriptConfig: string): string {
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

function isCruiseReport(value: unknown): value is CruiseReport {
  return typeof value === 'object' && value !== null;
}

function parseGraph(text: string): CruiseReport {
  try {
    const report: unknown = JSON.parse(text);
    return isCruiseReport(report) ? report : {};
  } catch (error) {
    throw new Error('dependency-cruiser did not produce valid JSON', { cause: error });
  }
}
