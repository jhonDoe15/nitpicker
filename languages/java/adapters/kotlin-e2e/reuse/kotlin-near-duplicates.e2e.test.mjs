import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';
import {
  initializeMavenProject,
  mavenDiffRunner,
} from '../maven/test-support/kotlin-maven-project.mjs';

const RULE = 'near-duplicate';
const BUILDS = [
  ['Gradle', initializeProject, diffOf],
  ['Maven', initializeMavenProject, mavenDiffRunner(process.env.NITPICKER_MAVEN)],
];

function pricing(name, label) {
  return [
    'package demo',
    '',
    `class ${name} {`,
    '    fun total(prices: LongArray, discount: Long, log: StringBuilder): Long {',
    '        var sum = 0L',
    '        for (price in prices) {',
    '            if (price > discount) {',
    '                sum += price - discount',
    '            }',
    '        }',
    `        log.append("${label}").append(':').append(sum)`,
    '        return if (sum > 1000) sum - discount else sum',
    '    }',
    '}',
    '',
  ].join('\n');
}

function nearDuplicates(findings) {
  return findings
    .filter(({ rule }) => rule === RULE)
    .map(({ tool, symbol, path }) => `${tool} ${symbol} ${path}`);
}

describe.skipIf(!kotlinE2eEnabled).each(BUILDS)(
  'near-duplicate on a Kotlin %s project',
  (_build, initialize, diffOn) => {
    const state = {};

    beforeAll(() => {
      state.project = initialize();
      commitBranch(state.project, 'near-copy', {
        [`${kotlinSources}/OrderPricing.kt`]: pricing('OrderPricing', 'orders'),
        [`${kotlinSources}/InvoicePricing.kt`]: pricing('InvoicePricing', 'invoices'),
      });
    }, 60_000);

    afterAll(() => {
      removeProject(state.project);
    });

    it('fails a function copied into another class with one changed literal', () => {
      const result = diffOn(state.project, 'near-copy');

      expect(nearDuplicates(result.newEnforceable)).toEqual([
        `structure OrderPricing.total(LongArray,Long,StringBuilder) ${kotlinSources}/OrderPricing.kt`,
      ]);
      expect(result.failed).toBe(true);
    }, 180_000);

    it('passes the copy with an exception', () => {
      const exceptions = [
        { rule: RULE, paths: [`${kotlinSources}/OrderPricing.kt`], reason: 'pricing per document' },
      ];
      const policy = { ...kotlinPolicy, exceptions };

      expect(nearDuplicates(diffOn(state.project, 'near-copy', { policy }).newEnforceable)).toEqual(
        [],
      );
    }, 180_000);
  },
);
