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
