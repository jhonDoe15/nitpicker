import { appendAll } from '../../lists/lists.mts';
import { RULE_IDS } from '../../policy.mts';
import { hash, metricFindings, summaryMetrics } from '../finding-parts.mts';
import type { Finding } from '../../values/findings.mts';
import { fieldOf, fieldsOf, listOf, optionalText, textOf } from '../../values/readers.mts';

const MESSAGES: Readonly<Record<string, string>> = {
  [RULE_IDS.noProductionRuntime]:
    'Test runs no production code: nothing it imports or references, directly or through test helpers, is production code. Test the production code it is about, or delete the test',
  [RULE_IDS.typeOnlyProductionDependency]:
    'Test reaches production code only through type-only imports. Import and run the production code it is about, or delete the test',
};

export function evaluateTestRuntime(report: unknown, analyzerName: string): Finding[] {
  const summary = fieldsOf(fieldOf(report, 'summary'));
  const counted = Object.fromEntries(
    Object.entries(summary).filter(([metricName]) => metricName !== 'categories'),
  );
  const findings = summaryMetrics(analyzerName, counted, 'test-runtime');
  for (const [category, value] of Object.entries(fieldsOf(summary['categories']))) {
    appendAll(
      findings,
      metricFindings({
        analyzerName,
        rule: 'category-count',
        path: '.',
        identity: `category:${category}`,
        message: `Tests classified as ${category}`,
        metricName: category,
        value,
      }),
    );
  }
  for (const finding of listOf(fieldOf(report, 'findings'))) {
    const category = textOf(fieldOf(finding, 'category'));
    const test = textOf(fieldOf(finding, 'test'));
    findings.push({
      tool: analyzerName,
      rule: category,
      path: test,
      identity: `test:${test}:source:${optionalText(fieldOf(finding, 'sourceHash')) ?? hash(test)}`,
      message: MESSAGES[category] ?? '',
      classification: 'enforceable',
    });
  }
  return findings;
}
