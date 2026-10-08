import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toEntryPointDiffFindings } from './entry-points.mjs';
import { PACKAGE_ROOT, resolveTool } from '../tool-resolution.mjs';
import { readLayout } from '../../preset/head-policy.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;

try {
  const options = parseArguments(process.argv.slice(2));
  const policyModules = await loadPolicyModules(options.policyRoot);
  const layout = readLayout();
  const findings = options.sourceRoots.flatMap((sourceRoot) =>
    toEntryPointDiffFindings(
      policyModules.analyzeEntryPoints(
        loadGraph(options, sourceRoot, layout, policyModules),
        sourceRoot,
        {
          layout,
        },
      ),
    ),
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
  const entryPointsModule = path.join(policyRoot, 'preset/entry-points/analyze.mjs');
  const dependencyGraphModule = path.join(policyRoot, 'preset/dependency-graph/cruise.mjs');
  const [
    { analyzeEntryPoints },
    { EXCLUDED_PATH_PATTERN: excludedPathPattern, withProjectTypeScriptConfig },
  ] = await Promise.all([
    import(pathToFileURL(entryPointsModule).href),
    import(pathToFileURL(dependencyGraphModule).href),
  ]);
  return {
    analyzeEntryPoints,
    excludedPathPattern,
    withProjectTypeScriptConfig,
  };
}

function loadGraph(
  options,
  sourceRoot,
  layout,
  { excludedPathPattern, withProjectTypeScriptConfig },
) {
  if (!existsSync(path.join(options.projectRoot, sourceRoot))) return { modules: [] };
  const dependencyCruiser = resolveTool('dependency-cruiser', {
    bin: 'bin/dependency-cruise.mjs',
  }).binPath;
  const config = path.join(options.policyRoot, 'preset/dependency-graph/config.mjs');
  const result = withProjectTypeScriptConfig(
    {
      policyRoot: options.policyRoot,
      projectRoot: options.projectRoot,
      name: 'entry-points',
    },
    (environment) =>
      spawnSync(
        process.execPath,
        [
          dependencyCruiser,
          sourceRoot,
          '--config',
          config,
          '--exclude',
          [excludedPathPattern, layout.excludePattern]
            .filter((pattern) => pattern !== undefined)
            .join('|'),
          '--output-type',
          'json',
        ],
        {
          cwd: options.projectRoot,
          env: { ...process.env, ...environment },
          encoding: 'utf8',
          maxBuffer: MAX_OUTPUT_BYTES,
        },
      ),
  );

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `dependency-cruiser exited with ${String(result.status)}: ${
        result.stderr.trim() || result.stdout.trim() || 'no diagnostic output'
      }`,
    );
  }

  let graph;
  try {
    graph = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('dependency-cruiser returned invalid JSON', {
      cause: error,
    });
  }
  if (!Array.isArray(graph.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

function parseArguments(arguments_) {
  const values = new Map();
  const sourceRoots = [];
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !['--project-root', '--policy-root', '--tool-root', '--source-root'].includes(name) ||
      value === undefined
    ) {
      throw new Error(`Invalid entry-point adapter argument: ${name ?? '<missing>'}`);
    }
    if (name === '--source-root') {
      sourceRoots.push(relativePath(value, name));
    } else {
      values.set(name, value);
    }
  }
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
  if (segments.length >= 2 && segments[0].startsWith('nitpicker-diff-') && segments[1] === 'base') {
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
