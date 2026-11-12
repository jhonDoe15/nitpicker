// Coupling metrics and the stability-direction rule, from neutral inputs.
//
// Input (`CouplingReport`), produced by a language adapter from its dependency graph:
//   {
//     summary?: { [metric]: number },
//     modules?: [{                     // one per source file / class / module
//       file: string,
//       fanIn?, fanOut?, totalCoupling?, instability?,
//       runtimeFanIn?, runtimeFanOut?, runtimeInstability?: number,
//     }],
//     packages?: [{                    // one per package / component
//       name: string, modules?, fanIn?, fanOut?, instability?: number,
//       cohesion?: { internalEdges?, edgeDensity?, connectedComponents?, largestComponentShare? },
//     }],
//   }

import { RULE_IDS } from '../policy.mjs';
import { addMetric, summaryMetrics } from './finding-helpers.mjs';
import { rounded, stabilityDirections } from './stability/stability-direction.mjs';

const MODULE_METRICS = [
  'fanIn',
  'fanOut',
  'totalCoupling',
  'instability',
  'runtimeFanIn',
  'runtimeFanOut',
  'runtimeInstability',
];

export function evaluateCoupling(report, analyzerName) {
  const findings = summaryMetrics(analyzerName, report.summary, 'coupling');
  for (const module of report.modules ?? []) {
    for (const metricName of MODULE_METRICS) {
      addMetric(findings, {
        analyzerName,
        rule: 'module-coupling',
        path: module.file,
        identity: `module:${metricName}`,
        message: `${metricName} for ${module.file}`,
        metricName,
        value: module[metricName],
      });
    }
  }
  for (const packageMetric of report.packages ?? []) {
    const values = {
      modules: packageMetric.modules,
      fanIn: packageMetric.fanIn,
      fanOut: packageMetric.fanOut,
      instability: packageMetric.instability,
      internalEdges: packageMetric.cohesion?.internalEdges,
      edgeDensity: packageMetric.cohesion?.edgeDensity,
      connectedComponents: packageMetric.cohesion?.connectedComponents,
      largestComponentShare: packageMetric.cohesion?.largestComponentShare,
    };
    for (const [metricName, value] of Object.entries(values)) {
      addMetric(findings, {
        analyzerName,
        rule: 'package-coupling',
        path: '.',
        identity: `package:${packageMetric.name}:${metricName}`,
        message: `${metricName} for package ${packageMetric.name}`,
        metricName,
        value,
      });
    }
  }
  for (const direction of report.stabilityDirection ?? []) {
    addStabilityFindings(findings, { analyzerName, direction });
  }
  return findings;
}

function addStabilityFindings(findings, { analyzerName, direction }) {
  const message =
    direction.message ?? `${direction.source} depends on less stable package ${direction.target}`;
  const identity = `package-edge:${direction.source}->${direction.target}`;
  findings.push({
    tool: analyzerName,
    rule: RULE_IDS.stabilityDirection,
    path: direction.path ?? direction.source,
    identity,
    message,
    classification: 'enforceable',
    ...(direction.cause === undefined ? {} : { cause: direction.cause }),
  });
  addMetric(findings, {
    analyzerName,
    rule: 'stability-direction-metric',
    path: '.',
    identity,
    message,
    metricName: 'instabilityDelta',
    value: direction.delta,
  });
}

// ---------------------------------------------------------------------------------------------
// Metric computation on a neutral dependency graph.
//
// Input: `{ modules, edges, packageOf, runtime? }`
//   modules   string[]            module ids (a source file / top-level class)
//   edges     [{ source, target, kind? }]   module -> dependency, both ends in `modules`; the
//                                  caller decides which edges exist (no self or external edges)
//   packageOf (module) => string  the package / component a module belongs to
//   runtime   boolean             also compute the runtime-only variants, from edges whose
//                                  `kind` is 'runtime' (default false)
//   modules[]: { module, package, fanIn, fanOut, totalCoupling, instability, [runtime*] }
//   packages[] (sorted by name): { name, modules, fanIn, fanOut, instability, cohesion }

function instabilityOf(fanIn, fanOut) {
  return fanIn + fanOut === 0 ? null : rounded(fanOut / (fanIn + fanOut));
}

function connectedComponentSizes(members, edges) {
  const adjacency = new Map(members.map((member) => [member, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const visited = new Set();
  const sizes = [];
  for (const member of members) {
    if (visited.has(member)) {
      continue;
    }
    let size = 0;
    const pending = [member];
    visited.add(member);
    while (pending.length > 0) {
      const current = pending.pop();
      size += 1;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((left, right) => right - left);
}

export function computeCoupling({ modules, edges, packageOf, runtime = false, ...stability }) {
  const runtimeEdges = edges.filter((edge) => edge.kind === 'runtime');
  const distinct = (list, predicate, side) =>
    new Set(list.filter(predicate).map((edge) => edge[side])).size;

  const moduleMetrics = modules.map((name) => {
    const fanIn = distinct(edges, (edge) => edge.target === name, 'source');
    const fanOut = distinct(edges, (edge) => edge.source === name, 'target');
    const metrics = {
      module: name,
      package: packageOf(name),
      fanIn,
      fanOut,
      totalCoupling: fanIn + fanOut,
      instability: instabilityOf(fanIn, fanOut),
    };
    if (runtime) {
      const runtimeFanIn = distinct(runtimeEdges, (edge) => edge.target === name, 'source');
      const runtimeFanOut = distinct(runtimeEdges, (edge) => edge.source === name, 'target');
      metrics.runtimeFanIn = runtimeFanIn;
      metrics.runtimeFanOut = runtimeFanOut;
      metrics.runtimeInstability = instabilityOf(runtimeFanIn, runtimeFanOut);
    }
    return metrics;
  });

  const packageNames = [...new Set(modules.map(packageOf))];
  const packages = packageNames
    .map((name) => {
      const members = modules.filter((module) => packageOf(module) === name);
      const internal = edges.filter(
        (edge) => packageOf(edge.source) === name && packageOf(edge.target) === name,
      );
      const fanIn = distinct(
        edges,
        (edge) => packageOf(edge.source) !== name && packageOf(edge.target) === name,
        'source',
      );
      const fanOut = distinct(
        edges,
        (edge) => packageOf(edge.source) === name && packageOf(edge.target) !== name,
        'target',
      );
      const componentSizes = connectedComponentSizes(members, internal);
      const possibleInternalEdges = members.length * Math.max(members.length - 1, 0);
      return {
        name,
        modules: members.length,
        fanIn,
        fanOut,
        instability: instabilityOf(fanIn, fanOut),
        cohesion: {
          internalEdges: internal.length,
          edgeDensity:
            possibleInternalEdges === 0 ? null : rounded(internal.length / possibleInternalEdges),
          connectedComponents: componentSizes.length,
          largestComponentShare:
            members.length === 0 ? null : rounded((componentSizes[0] ?? 0) / members.length),
        },
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const stabilityDirection = stabilityDirections({ modules, edges, packageOf, ...stability });

  return { modules: moduleMetrics, packages, stabilityDirection };
}

function byName(left, right) {
  if (left.name < right.name) {
    return -1;
  }
  return left.name > right.name ? 1 : 0;
}

/**
 * The `CouplingReport` for a module graph: drops self, repeated and external edges, then adds the
 * summary, per-module and per-package metrics and the stability-direction violations.
 * `fileOf(module)` gives the project-relative path a module's metrics are reported against.
 * An edge of `kind: 'type-only'` (a dependency that exists only for the type checker) counts in
 * every metric, including package instability, but is never itself reported as a
 * stability-direction violation; a repeated edge is type-only only when every copy is.
 */
export function buildCouplingReport({ modules, edges, packageOf, fileOf, roleOf }) {
  const moduleSet = new Set(modules);
  const moduleEdges = new Map();
  for (const { source, target, kind = 'runtime' } of edges) {
    const key = `${source}\0${target}`;
    if (source !== target && moduleSet.has(source) && moduleSet.has(target)) {
      const seen = moduleEdges.get(key);
      moduleEdges.set(key, { source, target, kind: seen?.kind === 'runtime' ? 'runtime' : kind });
    }
  }
  const allEdges = [...moduleEdges.values()];
  const metrics = computeCoupling({ modules, edges: allEdges, packageOf, roleOf, fileOf });
  const packages = metrics.packages.sort(byName);
  return {
    summary: {
      modules: modules.length,
      dependencies: allEdges.length,
      packages: packages.length,
    },
    modules: metrics.modules.map(({ module, fanIn, fanOut, totalCoupling, instability }) => ({
      file: fileOf(module),
      fanIn,
      fanOut,
      totalCoupling,
      instability,
    })),
    packages,
    stabilityDirection: metrics.stabilityDirection.map(reportedDirection),
  };
}

function reportedDirection({ source, target, delta, cause, path, message }) {
  return {
    source,
    target,
    delta,
    cause,
    ...(path === undefined ? {} : { path }),
    ...(message === undefined ? {} : { message }),
  };
}
