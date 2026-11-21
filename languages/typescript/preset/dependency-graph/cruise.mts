import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process';
import { spawnSyncWithOutputFile as untypedSpawnSyncWithOutputFile } from '../../../../core/tooling/output-file/output-file.mts';
import path from 'node:path';
import { isInsideRoot } from '../layout/source-root/root-paths.mts';
import { linkPolicyFile as untypedLinkPolicyFile } from '../../../../core/tooling/policy-links.mts';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mts';
import { readLayout as untypedReadLayout } from '../head-policy.mts';
import { EXCLUDED_PATH_PATTERN } from '../layout.mts';
import { layoutTransformFor as untypedLayoutTransformFor } from '../tool-configs.mts';
import { TOOL_RUN_CEILING_MS } from '../../../../shared/processes/deadlines.mts';
import { fieldsOf, parseJson } from '../../../../shared/values/readers.mts';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import {
  cruiserNodeArguments,
  reportSkippedFiles,
} from '../../adapters/dependency-graph/shared-graph/cruiser-process.mts';
import type {
  DependencyGraph,
  GraphDependency,
  GraphEdge,
  GraphImport,
  GraphModule,
} from './graph-types.mts';

type TsconfigTransform = (text: string, targetPath: string) => string;
type LinkedConfig = { readonly targetPath: string; readonly remove: () => void };
type ToolRun = {
  readonly policyRoot: string;
  readonly projectRoot: string;
  readonly name: string;
};

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;
const spawnSyncWithOutputFile: (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string> = untypedSpawnSyncWithOutputFile;
const linkPolicyFile: (
  source: string,
  target: string,
  transform: TsconfigTransform,
) => LinkedConfig = untypedLinkPolicyFile;
const readLayout: () => Layout & { readonly excludePattern?: string | undefined } =
  untypedReadLayout;
const layoutTransformFor: (
  policyFileName: string,
  layout: Layout,
) => TsconfigTransform | undefined = untypedLayoutTransformFor;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const dependencyCruiser = path.join(
  projectRoot,
  'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
);
const config = checkoutModulePath(path.join(import.meta.dirname, 'dependency-cruiser.config.mjs'));
export { EXCLUDED_PATH_PATTERN };
const excludedPath = new RegExp(EXCLUDED_PATH_PATTERN);
export const ARCHITECTURE_CONFIG =
  'languages/typescript/preset/defaults/dependency-cruiser.config.mjs';
export const POLICY_TYPESCRIPT_CONFIG =
  'languages/typescript/preset/defaults/tsconfig.quality.json';
export const TYPESCRIPT_CONFIG_ENVIRONMENT = 'NITPICKER_DEPENDENCY_GRAPH_TSCONFIG';

export function dependencyGraphTsconfig(layout: Layout): TsconfigTransform {
  const transform = layoutTransformFor(POLICY_TYPESCRIPT_CONFIG, layout);
  if (transform === undefined) {
    throw new TypeError(`No layout transform for ${POLICY_TYPESCRIPT_CONFIG}`);
  }
  return (text, targetPath) => {
    const config = fieldsOf(parseJson(transform(text, targetPath)));
    const compilerOptions = {
      ...fieldsOf(config['compilerOptions']),
      rewriteRelativeImportExtensions: false,
    };
    return `${JSON.stringify({ ...config, compilerOptions }, null, 2)}\n`;
  };
}

function withProjectTypeScriptConfig(
  { policyRoot, projectRoot: root, name }: ToolRun,
  operation: (environment: Record<string, string>) => SpawnSyncReturns<string>,
): SpawnSyncReturns<string> {
  const linkedConfig = linkPolicyFile(
    path.join(policyRoot, POLICY_TYPESCRIPT_CONFIG),
    path.join(root, `.nitpicker-${name}-tsconfig.json`),
    dependencyGraphTsconfig(readLayout()),
  );
  try {
    return operation({ [TYPESCRIPT_CONFIG_ENVIRONMENT]: linkedConfig.targetPath });
  } finally {
    linkedConfig.remove();
  }
}

function spawnDependencyCruiser(
  paths: readonly string[],
  environment: Record<string, string>,
): SpawnSyncReturns<string> {
  return spawnSyncWithOutputFile(
    process.execPath,
    [
      ...cruiserNodeArguments(),
      dependencyCruiser,
      ...paths,
      '--config',
      config,
      '--exclude',
      [EXCLUDED_PATH_PATTERN, readLayout().excludePattern]
        .filter((pattern) => pattern !== undefined)
        .join('|'),
      '--output-type',
      'json',
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: TOOL_RUN_CEILING_MS,
    },
  );
}

function assertSuccessful(result: SpawnSyncReturns<string>): void {
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `dependency-cruiser failed with exit ${String(result.status)}:\n${result.stderr || result.stdout}`,
    );
  }
}

export function isGraph(value: unknown): value is DependencyGraph {
  return (
    typeof value === 'object' &&
    value !== null &&
    'modules' in value &&
    Array.isArray(value.modules)
  );
}

function parseGraph(stdout: string): DependencyGraph {
  let graph: unknown;
  try {
    graph = JSON.parse(stdout);
  } catch (error) {
    throw new Error('dependency-cruiser did not produce valid JSON', { cause: error });
  }

  if (!isGraph(graph)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

export function cruise(
  paths: readonly string[],
  { typeScriptRoot = projectRoot }: { readonly typeScriptRoot?: string } = {},
): DependencyGraph {
  if (paths.length === 0) return { modules: [] };
  const result = withProjectTypeScriptConfig(
    {
      policyRoot: projectRoot,
      projectRoot: path.resolve(projectRoot, typeScriptRoot),
      name: `dependency-graph-${String(process.pid)}`,
    },
    (environment) => spawnDependencyCruiser(paths, environment),
  );
  assertSuccessful(result);
  const graph = parseGraph(result.stdout);
  reportSkippedFiles(result.stderr, () => graph.modules.length);
  return graph;
}

export function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isExcludedPath(value: string): boolean {
  const normalized = normalizePath(value);
  return excludedPath.test(normalized) || normalized.endsWith('.d.ts');
}

export function isTypeOnlyDependency(dependency: {
  readonly preCompilationOnly?: unknown;
  readonly dependencyTypes?: readonly string[];
}): boolean {
  return (
    dependency.preCompilationOnly === true ||
    dependency.dependencyTypes?.includes('type-only') === true
  );
}

function isWithinRoot(file: string, root: string): boolean {
  return !isExcludedPath(file) && (file === root || isInsideRoot(file, root));
}

type EdgeContext = { readonly modulePaths: ReadonlySet<string>; readonly root: string };

function internalTarget(
  dependency: GraphDependency,
  { modulePaths, root }: EdgeContext,
): string | undefined {
  if (typeof dependency.resolved !== 'string') return undefined;
  const target = normalizePath(dependency.resolved);
  return modulePaths.has(target) && isWithinRoot(target, root) ? target : undefined;
}

function recordEdge(
  edgeKinds: Map<string, GraphEdge['kind']>,
  { source, target, dependency }: { source: string; target: string; dependency: GraphDependency },
): void {
  const key = `${source}\0${target}`;
  const kind = isTypeOnlyDependency(dependency) ? 'type-only' : 'runtime';
  if (edgeKinds.get(key) !== 'runtime') {
    edgeKinds.set(key, kind);
  }
}

function recordModuleEdges(
  edgeKinds: Map<string, GraphEdge['kind']>,
  module: GraphModule,
  context: EdgeContext,
): void {
  const source = normalizePath(module.source);
  if (!isWithinRoot(source, context.root)) return;
  for (const dependency of module.dependencies ?? []) {
    const target = internalTarget(dependency, context);
    if (target !== undefined) recordEdge(edgeKinds, { source, target, dependency });
  }
}

export function internalEdges(graph: unknown, sourceRoot: string): GraphEdge[] {
  if (!isGraph(graph)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }

  const context: EdgeContext = {
    root: normalizePath(sourceRoot).replace(/\/$/, ''),
    modulePaths: new Set(graph.modules.map((module) => normalizePath(module.source))),
  };
  const edgeKinds = new Map<string, GraphEdge['kind']>();
  for (const module of graph.modules) recordModuleEdges(edgeKinds, module, context);

  return [...edgeKinds].map(([key, kind]) => {
    const [source = '', target = ''] = key.split('\0');
    return { source, target, kind };
  });
}

export function projectSources(
  graph: DependencyGraph,
  isSourceFile: (file: string) => boolean,
): string[] {
  return graph.modules.map((module) => normalizePath(module.source)).filter(isSourceFile);
}

export function projectImports(
  graph: DependencyGraph,
  isSourceFile: (file: string) => boolean,
): GraphImport[] {
  const sources = new Set(projectSources(graph, isSourceFile));
  return graph.modules.flatMap((module) => {
    const from = normalizePath(module.source);
    return sources.has(from)
      ? (module.dependencies ?? [])
          .flatMap(({ resolved }) =>
            typeof resolved === 'string' ? [{ from, to: normalizePath(resolved) }] : [],
          )
          .filter(({ to }) => sources.has(to))
      : [];
  });
}
