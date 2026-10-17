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

import { addMetric, hash, summaryMetrics } from './finding-helpers.mjs';

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
      message: `Test has ${finding.category.replaceAll('-', ' ')}`,
      classification: 'enforceable',
    });
  }
  return findings;
}

export function testConsoleRule(ids, enforcedBy) {
  return {
    id: ids.testConsoleOutput,
    check: 'test-console',
    limit:
      'a test file printing console.error or console.warn output (compared as text with numbers and paths normalized, one random-looking word tolerated) that the base run did not print',
    enforcedBy,
  };
}
