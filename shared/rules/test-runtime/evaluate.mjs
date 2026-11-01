// Test-runtime findings, from neutral inputs.
//
// Input (`TestRuntimeReport`), produced by a language adapter:
//   {
//     summary?: { [metric]: number, categories?: { [category]: number } },
//     findings?: [{
//       test: string,          // project-relative path of the offending test
//       category: string,      // the rule id, for example `no-production-runtime`
//       sourceHash?: string,   // digest of the test text; defaults to a digest of the path
//     }],
//   }
// Each finding is enforceable and keyed by test path and source hash; the category counts and the
// other summary figures are descriptive metrics.

import { RULE_IDS } from '../../policy.mjs';
import { addMetric, hash, summaryMetrics } from '../finding-helpers.mjs';

const MESSAGES = {
  [RULE_IDS.noProductionRuntime]:
    'Test runs no production code: nothing it imports or references, directly or through test helpers, is production code. Test the production code it is about, or delete the test',
  [RULE_IDS.typeOnlyProductionDependency]:
    'Test reaches production code only through type-only imports. Import and run the production code it is about, or delete the test',
};

export function evaluateTestRuntime(report, analyzerName) {
  const findings = summaryMetrics(analyzerName, report.summary, 'test-runtime', ['categories']);
  for (const [category, value] of Object.entries(report.summary?.categories ?? {})) {
    addMetric(findings, {
      analyzerName,
      rule: 'category-count',
      path: '.',
      identity: `category:${category}`,
      message: `Tests classified as ${category}`,
      metricName: category,
      value,
    });
  }
  for (const finding of report.findings ?? []) {
    findings.push({
      tool: analyzerName,
      rule: finding.category,
      path: finding.test,
      identity: `test:${finding.test}:source:${finding.sourceHash ?? hash(finding.test)}`,
      message: MESSAGES[finding.category],
      classification: 'enforceable',
    });
  }
  return findings;
}
