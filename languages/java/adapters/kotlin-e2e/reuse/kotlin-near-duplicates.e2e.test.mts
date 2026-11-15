import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { assigned } from '../test-support/views/assigned.mts';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { DiffOptions, DiffResult, KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import {
  initializeMavenProject,
  mavenDiffRunner,
} from '../maven/__tests__/kotlin-maven-project.mts';

const RULE = 'near-duplicate';
type Builder = (project: KotlinProject, branch: string, options?: DiffOptions) => DiffResult;

const BUILDS: [string, () => KotlinProject, Builder][] = [
  ['Gradle', initializeProject, diffOf],
  ['Maven', initializeMavenProject, mavenDiffRunner(process.env['NITPICKER_MAVEN'])],
];

function pricing(name: string, label: string) {
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

function nearDuplicates(findings: Finding[]) {
  return findings
    .filter(({ rule }) => rule === RULE)
    .map(({ tool, symbol, path }) => `${tool} ${String(symbol)} ${path}`);
}

describe.skipIf(!kotlinE2eEnabled).each(BUILDS)(
  'near-duplicate on a Kotlin %s project',
  (_build, initialize, diffOn) => {
    const state: { project?: KotlinProject } = {};

    beforeAll(() => {
      const created = initialize();
      state.project = created;
      commitBranch(created, 'near-copy', {
        [`${kotlinSources}/OrderPricing.kt`]: pricing('OrderPricing', 'orders'),
        [`${kotlinSources}/InvoicePricing.kt`]: pricing('InvoicePricing', 'invoices'),
      });
    }, 60_000);

    afterAll(() => {
      removeProject(assigned(state.project, 'project'));
    });

    it('fails a function copied into another class with one changed literal', () => {
      const result = diffOn(assigned(state.project, 'project'), 'near-copy');

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

      expect(
        nearDuplicates(
          diffOn(assigned(state.project, 'project'), 'near-copy', { policy }).newEnforceable,
        ),
      ).toEqual([]);
    }, 180_000);
  },
);
