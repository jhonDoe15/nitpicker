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
//     stabilityDirection?: [{ source: string, target: string, delta: number }],
//   }
// `stabilityDirection` lists the package edges where `source` depends on a less stable `target`
// (instability delta `delta`); each is an enforceable `stability-direction` finding.

import { RULE_IDS } from '../policy.mjs';
import { addMetric, summaryMetrics } from './finding-helpers.mjs';

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
    const message = `${direction.source} depends on less stable package ${direction.target}`;
    const identity = `package-edge:${direction.source}->${direction.target}`;
    findings.push({
      tool: analyzerName,
      rule: RULE_IDS.stabilityDirection,
      path: '.',
      identity,
      message,
      classification: 'enforceable',
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
  return findings;
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
// Output: `{ modules, packages, stabilityDirection }`; the adapter adds its own summary.
//   modules[]: { module, package, fanIn, fanOut, totalCoupling, instability, [runtime*] }
//   packages[] (sorted by name): { name, modules, fanIn, fanOut, instability, cohesion }
//   stabilityDirection[]: { source, target, sourceInstability, targetInstability, delta },
//     one per package pair whose source is less stable than its target, largest delta first.

function rounded(value) {
  return Math.round(value * 10_000) / 10_000;
}

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

export function computeCoupling({ modules, edges, packageOf, runtime = false }) {
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

  const packageByName = new Map(packages.map((entry) => [entry.name, entry]));
  const stabilityDirection = [];
  const seenPackageEdges = new Set();
  for (const edge of edges) {
    const sourcePackage = packageOf(edge.source);
    const targetPackage = packageOf(edge.target);
    if (sourcePackage === targetPackage) {
      continue;
    }
    const key = `${sourcePackage}\0${targetPackage}`;
    if (seenPackageEdges.has(key)) {
      continue;
    }
    seenPackageEdges.add(key);
    const sourceInstability = packageByName.get(sourcePackage)?.instability;
    const targetInstability = packageByName.get(targetPackage)?.instability;
    if (
      typeof sourceInstability === 'number' &&
      typeof targetInstability === 'number' &&
      sourceInstability < targetInstability
    ) {
      stabilityDirection.push({
        source: sourcePackage,
        target: targetPackage,
        sourceInstability,
        targetInstability,
        delta: rounded(targetInstability - sourceInstability),
      });
    }
  }
  stabilityDirection.sort((left, right) => right.delta - left.delta);

  return { modules: moduleMetrics, packages, stabilityDirection };
}
