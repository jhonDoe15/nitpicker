import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { importEntryPointAnalyzer, toEntryPointDiffFindings } from './typed/entry-points.mts';
import {
  type CruiseReport,
  applyAreaExceptions,
  existingRoots,
  loadDependencyGraph,
  isInvokedModule,
  writeAdapterFindings,
} from './typed/static-checks.mts';
import type { Finding } from './static-checks/shared.mts';
import { PACKAGE_ROOT, SNAPSHOT_DIRECTORY_NAMES } from '../../../core/tooling/tool-resolution.mjs';
import { type Layout, readLayout } from './typed/head-policy.mts';
import { EXCLUDED_PATH_PATTERN } from '../preset/dependency-graph/cruise.mjs';
import { realTemporaryDirectory } from '../../../core/tooling/temporary-files.mjs';

type EntryPointOptions = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly sourceRoots: readonly string[];
};

const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;
const ARGUMENT_NAMES = ['--project-root', '--policy-root', '--tool-root', '--source-root'];

if (isInvokedModule(import.meta.url)) {
  process.exitCode = await writeAdapterFindings('Entry-point differential adapter', () =>
    entryPointFindings(parseArguments(process.argv.slice(2))),
  );
}

async function entryPointFindings(options: EntryPointOptions): Promise<Finding[]> {
  const analyzeEntryPoints = await loadPolicyModules(options.policyRoot);
  const layout = readLayout();
  const graphFor = graphLoader(options, layout);
  return applyAreaExceptions(
    options.sourceRoots.flatMap((sourceRoot) =>
      toEntryPointDiffFindings(analyzeEntryPoints(graphFor(sourceRoot), sourceRoot, { layout })),
    ),
  );
}

async function loadPolicyModules(policyRoot: string) {
  const entryPointsModule = path.join(
    policyRoot,
    'languages/typescript/preset/entry-points/analyze.mjs',
  );
  return importEntryPointAnalyzer(pathToFileURL(entryPointsModule).href);
}

function graphLoader(
  options: EntryPointOptions,
  layout: Layout,
): (sourceRoot: string) => CruiseReport {
  const graphs = new Map<string, CruiseReport>();
  return (sourceRoot) => {
    if (!existsSync(path.join(options.projectRoot, sourceRoot))) {
      return { modules: [] };
    }
    const patterns = layout.graphRoots.includes(sourceRoot)
      ? existingRoots(options.projectRoot, layout.graphRoots)
      : [sourceRoot];
    const key = patterns.join('\0');
    const cached = graphs.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const graph = loadModules(options, patterns);
    graphs.set(key, graph);
    return graph;
  };
}

function loadModules(options: EntryPointOptions, patterns: readonly string[]): CruiseReport {
  const graph = loadDependencyGraph({
    projectRoot: options.projectRoot,
    policyRoot: options.policyRoot,
    patterns,
    exclude: EXCLUDED_PATH_PATTERN,
    reportsConfigErrors: false,
  });
  if (!Array.isArray(graph.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

function collectArguments(arguments_: readonly string[]) {
  const values = new Map<string, string>();
  const sourceRoots: string[] = [];
  const remaining = arguments_.values();
  for (const name of remaining) {
    const { value } = remaining.next();
    if (!ARGUMENT_NAMES.includes(name) || value === undefined) {
      throw new Error(`Invalid entry-point adapter argument: ${name}`);
    }
    if (name === '--source-root') {
      sourceRoots.push(relativePath(value, name));
    } else {
      values.set(name, value);
    }
  }
  return { values, sourceRoots };
}

function parseArguments(arguments_: readonly string[]): EntryPointOptions {
  const { values, sourceRoots } = collectArguments(arguments_);
  if (sourceRoots.length === 0) {
    throw new Error('--source-root is required');
  }

  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error(`--tool-root must resolve to ${TRUSTED_TOOL_ROOT}`);
  }

  return {
    projectRoot: validatedRoot(requiredValue(values, '--project-root'), '--project-root'),
    policyRoot: validatedRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    sourceRoots,
  };
}

function validatedRoot(value: string, name: string): string {
  const root = realpathSync(value);
  if (root === PACKAGE_ROOT) {
    return root;
  }
  const segments = path.relative(realTemporaryDirectory(), root).split(path.sep);
  if (
    segments.length >= 2 &&
    (segments[0] ?? '').startsWith('nitpicker-diff-') &&
    SNAPSHOT_DIRECTORY_NAMES.includes(segments[1] ?? '')
  ) {
    return root;
  }
  throw new Error(
    `${name} must be inside a generated quality-diff worktree or the trusted package`,
  );
}

function requiredValue(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function relativePath(value: string, name: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    path.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`${name} must stay within the analyzed snapshot`);
  }
  return normalized.replace(/^\.\//, '').replace(/\/$/, '');
}
