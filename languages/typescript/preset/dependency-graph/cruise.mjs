import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { readLayout } from '../head-policy.mjs';
import { EXCLUDED_PATH_PATTERN } from '../layout.mjs';
import { layoutTransformFor } from '../tool-configs.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const dependencyCruiser = path.join(
  projectRoot,
  'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
);
const config = path.join(import.meta.dirname, 'dependency-graph.config.mjs');
export { EXCLUDED_PATH_PATTERN };
const excludedPath = new RegExp(EXCLUDED_PATH_PATTERN);
export const ARCHITECTURE_CONFIG =
  'languages/typescript/preset/defaults/dependency-cruiser.config.mjs';
export const POLICY_TYPESCRIPT_CONFIG =
  'languages/typescript/preset/defaults/tsconfig.quality.json';
export const TYPESCRIPT_CONFIG_ENVIRONMENT = 'NITPICKER_DEPENDENCY_GRAPH_TSCONFIG';

function withProjectTypeScriptConfig({ policyRoot, projectRoot: root, name }, operation) {
  const linkedConfig = linkPolicyFile(
    path.join(policyRoot, POLICY_TYPESCRIPT_CONFIG),
    path.join(root, `.nitpicker-${name}-tsconfig.json`),
    layoutTransformFor(POLICY_TYPESCRIPT_CONFIG, readLayout()),
  );
  try {
    return operation({ [TYPESCRIPT_CONFIG_ENVIRONMENT]: linkedConfig.targetPath });
  } finally {
    linkedConfig.remove();
  }
}

export function cruise(paths, { typeScriptRoot = projectRoot } = {}) {
  if (paths.length === 0) return { modules: [] };
  const result = withProjectTypeScriptConfig(
    {
      policyRoot: projectRoot,
      projectRoot: path.resolve(projectRoot, typeScriptRoot),
      name: `dependency-graph-${String(process.pid)}`,
    },
    (environment) =>
      spawnSync(
        process.execPath,
        [
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
        },
      ),
  );

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `dependency-cruiser failed with exit ${String(result.status)}:\n${result.stderr || result.stdout}`,
    );
  }

  let graph;
  try {
    graph = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('dependency-cruiser did not produce valid JSON', { cause: error });
  }

  if (!Array.isArray(graph.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

export function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isExcludedPath(value) {
  const normalized = normalizePath(value);
  return excludedPath.test(normalized) || normalized.endsWith('.d.ts');
}

export function isTypeOnlyDependency(dependency) {
  return (
    dependency.preCompilationOnly === true ||
    dependency.dependencyTypes?.includes('type-only') === true
  );
}

export function internalEdges(graph, sourceRoot) {
  if (!Array.isArray(graph?.modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }

  const normalizedRoot = normalizePath(sourceRoot).replace(/\/$/, '');
  const modulePaths = new Set(graph.modules.map((module) => normalizePath(module.source)));
  const edgeKinds = new Map();

  for (const module of graph.modules) {
    const source = normalizePath(module.source);
    if (
      isExcludedPath(source) ||
      (source !== normalizedRoot && !source.startsWith(`${normalizedRoot}/`))
    ) {
      continue;
    }
    for (const dependency of module.dependencies ?? []) {
      if (typeof dependency.resolved !== 'string') {
        continue;
      }
      const target = normalizePath(dependency.resolved);
      if (
        isExcludedPath(target) ||
        !modulePaths.has(target) ||
        (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}/`))
      ) {
        continue;
      }

      const key = `${source}\0${target}`;
      const kind = isTypeOnlyDependency(dependency) ? 'type-only' : 'runtime';
      if (edgeKinds.get(key) !== 'runtime') {
        edgeKinds.set(key, kind);
      }
    }
  }

  return [...edgeKinds].map(([key, kind]) => {
    const [source, target] = key.split('\0');
    return { source, target, kind };
  });
}
