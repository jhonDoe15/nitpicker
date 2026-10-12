import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toEntryPointDiffFindings } from './entry-points.mjs';
import { PACKAGE_ROOT, SNAPSHOT_DIRECTORY_NAMES } from '../../../core/tooling/tool-resolution.mjs';
import { existingRoots } from '../preset/layout.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import { EXCLUDED_PATH_PATTERN } from '../preset/dependency-graph/cruise.mjs';
import { loadDependencyGraph } from './project-dependency-graph.mjs';

const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;
const ARGUMENT_NAMES = ['--project-root', '--policy-root', '--tool-root', '--source-root'];

try {
  const options = parseArguments(process.argv.slice(2));
  const { analyzeEntryPoints } = await loadPolicyModules(options.policyRoot);
  const layout = readLayout();
  const graphFor = graphLoader(options, layout);
  const findings = options.sourceRoots.flatMap((sourceRoot) =>
    toEntryPointDiffFindings(analyzeEntryPoints(graphFor(sourceRoot), sourceRoot, { layout })),
  );
  process.stdout.write(`${JSON.stringify({ findings })}\n`);
} catch (error) {
  process.stderr.write(
    `Entry-point differential adapter failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 2;
}

async function loadPolicyModules(policyRoot) {
  const entryPointsModule = path.join(
    policyRoot,
    'languages/typescript/preset/entry-points/analyze.mjs',
  );
  return import(pathToFileURL(entryPointsModule).href);
}

function graphLoader(options, layout) {
  const graphs = new Map();
  return (sourceRoot) => {
    if (!existsSync(path.join(options.projectRoot, sourceRoot))) return { modules: [] };
    const patterns = layout.graphRoots.includes(sourceRoot)
      ? existingRoots(options.projectRoot, layout.graphRoots)
      : [sourceRoot];
    const key = patterns.join('\0');
    if (!graphs.has(key)) {
      graphs.set(key, loadModules(options, patterns));
    }
    return graphs.get(key);
  };
}

function loadModules(options, patterns) {
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

function collectArguments(arguments_) {
  const values = new Map();
  const sourceRoots = [];
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

function parseArguments(arguments_) {
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

function validatedRoot(value, name) {
  const root = realpathSync(value);
  if (root === PACKAGE_ROOT) {
    return root;
  }
  const segments = path.relative(realpathSync(tmpdir()), root).split(path.sep);
  if (
    segments.length >= 2 &&
    segments[0].startsWith('nitpicker-diff-') &&
    SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    return root;
  }
  throw new Error(
    `${name} must be inside a generated quality-diff worktree or the trusted package`,
  );
}

function requiredValue(values, name) {
  const value = values.get(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function relativePath(value, name) {
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
