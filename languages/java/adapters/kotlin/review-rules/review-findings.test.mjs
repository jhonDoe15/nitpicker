import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../../core/diff/comparison/finding-schema.mjs';
import { KOTLIN_EXCEPTION_RULES, validateKotlinOptions } from '../kotlin-options.mjs';
import { readKotlinFacts } from './kotlin-facts.mjs';
import { readKotlinReviewFindings } from './review-findings.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from './review-rules.mjs';
import {
  call,
  file,
  fn,
  klass,
  parameter,
  testFile,
  testMethod,
  wait,
} from './test-support/facts.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(facts) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-review-'));
  temporaryRoots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  if (facts !== undefined) {
    writeFileSync(path.join(reportRoot, 'kotlin-facts.json'), JSON.stringify(facts));
  }
  return { root, reportRoot };
}

describe('readKotlinReviewFindings', () => {
  it('is empty when the facts report is missing or lists no files', () => {
    const missing = projectWith();
    const empty = projectWith({ files: [] });

    expect(readKotlinFacts(missing.reportRoot)).toEqual({ files: [] });
    expect(
      readKotlinReviewFindings({ ...missing, projectRoot: missing.root, manifest: {} }),
    ).toEqual([]);
    expect(readKotlinReviewFindings({ ...empty, projectRoot: empty.root, manifest: {} })).toEqual(
      [],
    );
  });

  it('reads every rule from one facts report and produces findings the schema accepts', () => {
    const facts = {
      files: [
        file({
          classes: [
            klass('Mailer', {
              visibility: 'internal',
              primaryParameters: [parameter('retries', 'Int', { default: true })],
            }),
          ],
          calls: [call('Mailer')],
        }),
        testFile({
          classes: [klass('SampleTest')],
          functions: [testMethod(), fn('helper')],
          waits: [wait('sleep')],
        }),
      ],
    };
    const { root, reportRoot } = projectWith(facts);

    const findings = readKotlinReviewFindings({ reportRoot, projectRoot: root, manifest: {} });

    expect(findings.map(({ tool, rule }) => `${tool}/${rule}`).sort()).toEqual([
      'pmd/FixedSleepInTest',
      'structure/unused-option',
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'kotlin')).not.toThrow();
  });
});

describe('Kotlin exception rules for the review rules', () => {
  it('lists each rule as it is printed and accepts an exception for it', () => {
    expect(KOTLIN_REVIEW_EXCEPTION_RULES).toEqual([
      'pmd/FixedSleepInTest',
      'pmd/NegativeWaitInTest',
      'pmd/SpringUnusedContext',
      'pmd/ExhaustiveEnumPredicate',
      'pmd/StaticForwardingWrapper',
      'pmd/SingularAndPluralMember',
      'unused-option',
    ]);
    for (const rule of KOTLIN_REVIEW_EXCEPTION_RULES) {
      expect(KOTLIN_EXCEPTION_RULES).toContain(rule);
      const config = {
        preset: 'kotlin',
        exceptions: [{ rule, paths: ['src/**'], reason: 'intended' }],
      };
      expect(() => {
        validateKotlinOptions(config);
      }).not.toThrow();
    }
  });
});
