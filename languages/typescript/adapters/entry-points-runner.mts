import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { importEntryPointAnalyzer, toEntryPointDiffFindings } from './typed/entry-points.mts';
import {
  type CruiseReport,
  applyAreaExceptions,
  existingRoots,
  loadDependencyGraph,
  withTypeScriptHint,
} from './typed/static-checks.mts';
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

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const analyzeEntryPoints = await loadPolicyModules(options.policyRoot);
    const layout = readLayout();
    const graphFor = graphLoader(options, layout);
    const findings = applyAreaExceptions(
      options.sourceRoots.flatMap((sourceRoot) =>
        toEntryPointDiffFindings(analyzeEntryPoints(graphFor(sourceRoot), sourceRoot, { layout })),
      ),
    );
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (failure) {
    const error = withTypeScriptHint(failure);
    process.stderr.write(`Entry-point differential adapter failed: ${error.message}\n`);
    process.exitCode = 2;
  }
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
  });
  if (!Array.isArray(graph.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

function collectArguments(runnerArguments: readonly string[]) {
  const values = new Map<string, string>();
  const sourceRoots: string[] = [];
  const remaining = runnerArguments.values();
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

function parseArguments(runnerArguments: readonly string[]): EntryPointOptions {
  const { values, sourceRoots } = collectArguments(runnerArguments);
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
