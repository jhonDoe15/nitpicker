import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toEntryPointDiffFindings } from './entry-points.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TRUSTED_TOOL_ROOT = realpathSync(path.resolve(import.meta.dirname, '../..'));

try {
  const options = parseArguments(process.argv.slice(2));
  const policyModules = await loadPolicyModules(options.policyRoot);
  const report = policyModules.analyzeEntryPoints(
    loadGraph(options, policyModules),
    options.sourceRoot,
  );
  process.stdout.write(`${JSON.stringify({ findings: toEntryPointDiffFindings(report) })}\n`);
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
  return { analyzeEntryPoints, excludedPathPattern, withProjectTypeScriptConfig };
}

function loadGraph(options, { excludedPathPattern, withProjectTypeScriptConfig }) {
  const dependencyCruiser = path.join(
    options.toolRoot,
    'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
  );
  const config = path.join(options.policyRoot, 'preset/dependency-graph/config.mjs');
  const result = withProjectTypeScriptConfig(
    { policyRoot: options.policyRoot, projectRoot: options.projectRoot, name: 'entry-points' },
    (environment) =>
      spawnSync(
        process.execPath,
        [
          dependencyCruiser,
          options.sourceRoot,
          '--config',
          config,
          '--exclude',
          excludedPathPattern,
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

  const graph = JSON.parse(result.stdout);
  if (!Array.isArray(graph.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !['--project-root', '--policy-root', '--tool-root', '--source-root'].includes(name) ||
      value === undefined
    ) {
      throw new Error(`Invalid entry-point adapter argument: ${name ?? '<missing>'}`);
    }
    values.set(name, value);
  }

  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error(`--tool-root must resolve to ${TRUSTED_TOOL_ROOT}`);
  }

  return {
    projectRoot: realpathSync(requiredValue(values, '--project-root')),
    policyRoot: realpathSync(requiredValue(values, '--policy-root')),
    toolRoot,
    sourceRoot: relativePath(requiredValue(values, '--source-root'), '--source-root'),
  };
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
