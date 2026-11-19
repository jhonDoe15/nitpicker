import { EXCLUDED_PATH_PATTERN } from '../../../preset/dependency-graph/cruise.mjs';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import { type CruiseReport, loadDependencyGraph } from '../project-dependency-graph.mts';

type ProjectModulesRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly liveProjectRoot?: string;
  readonly patterns: readonly string[];
};

const excludedPath = new RegExp(EXCLUDED_PATH_PATTERN, 'u');

export function loadProjectModules(request: ProjectModulesRequest): CruiseReport {
  const report = loadDependencyGraph({
    ...request,
    exclude: undefined,
    reportsConfigErrors: false,
  });
  if (!Array.isArray(report.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return withoutExcludedModules(report);
}

function isExcluded(file: unknown): boolean {
  return typeof file === 'string' && excludedPath.test(file.replaceAll('\\', '/'));
}

function withoutExcludedDependencies(module: unknown): unknown {
  const dependencies = fieldOf(module, 'dependencies');
  if (!Array.isArray(dependencies)) {
    return module;
  }
  return {
    ...fieldsOf(module),
    dependencies: dependencies.filter((dependency) => !isExcluded(fieldOf(dependency, 'resolved'))),
  };
}

export function withoutExcludedModules(report: CruiseReport): CruiseReport {
  const modules = listOf(report.modules)
    .filter((module) => !isExcluded(fieldOf(module, 'source')))
    .map(withoutExcludedDependencies);
  return { ...report, modules };
}
