import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXPECTED_REVIEW_FINDINGS,
  REVIEW_RULE_FILES,
} from '../test-support/review/kotlin-review-data.mjs';
import { PLURAL_FINDINGS } from '../test-support/review/kotlin-plural-data.mjs';
import {
  commitBranch,
  commitFromBranch,
  git,
  initializeMavenProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  mavenDiffRunner,
  removeProject,
} from './test-support/kotlin-maven-project.mjs';

const mavenDiffOf = mavenDiffRunner(process.env.NITPICKER_MAVEN);
const REVIEW_TOOLS = new Set(['pmd']);
const ORDERS_TESTS = 'src/test/kotlin/demo/orders/*';
const RUNTIME_SERIALIZATION = `    <dependency>
      <groupId>com.fasterxml.jackson.module</groupId>
      <artifactId>jackson-module-kotlin</artifactId>
      <version>2.17.2</version>
      <scope>runtime</scope>
    </dependency>
  </dependencies>`;
const DISTRIBUTION = `  <distributionManagement>
    <repository>
      <id>releases</id>
      <url>file:///tmp/nitpicker-releases</url>
    </repository>
  </distributionManagement>
</project>`;

function reviewFindings(findings) {
  return findings
    .filter(({ tool, rule }) => REVIEW_TOOLS.has(tool) || rule === 'unused-option')
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rules on Maven end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeMavenProject();
    commitBranch(project, 'review-rules', REVIEW_RULE_FILES);
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails the sleeps, enum predicates, wrapper, plural member, unused option and unused context, and spares the allowed forms', () => {
    const result = mavenDiffOf(project, 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(EXPECTED_REVIEW_FINDINGS);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = mavenDiffOf(project, 'review-rules', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          { rule: 'pmd/FixedSleepInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'pmd/MockedSubjectInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/StaticMockOfProjectType', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
          { rule: 'pmd/ClassLoadEffect', glob: 'src/main/kotlin/demo/orders/Inventory.kt' },
        ],
      },
    });

    expect(reviewFindings(result.newEnforceable)).toEqual(
      [
        'ExhaustiveEnumPredicate isHandedOver',
        'ExhaustiveEnumPredicate isLive',
        'ExhaustiveEnumPredicate isOpen',
        'ExhaustiveEnumPredicate isPending',
        'ExhaustiveEnumPredicate isSettled',
        'ExhaustiveEnumPredicate weight',
        ...PLURAL_FINDINGS,
        'StaticForwardingWrapper absOf',
        'StaticForwardingWrapper total',
        'timeout-abandons-operation awaitAllOutside:withTimeout:first',
        'timeout-abandons-operation awaitAllOutside:withTimeout:second',
        'timeout-abandons-operation awaitOutside:withTimeout:work',
        'timeout-abandons-operation boundedAsync:orTimeout:supplyAsync',
        'timeout-abandons-operation cancelAsyncTask:get:future',
        'timeout-abandons-operation giveUp:get:future',
        'timeout-abandons-operation shutDownLetsItFinish:get:future',
      ].sort(),
    );
  });

  it('skips data classes when a serialization library is only on the runtime classpath', () => {
    const pom = readFileSync(path.join(project.root, 'pom.xml'), 'utf8');
    commitFromBranch(project, {
      name: 'runtime-serialization',
      from: 'review-rules',
      files: { 'pom.xml': pom.replace('  </dependencies>', RUNTIME_SERIALIZATION) },
    });

    const result = mavenDiffOf(project, 'runtime-serialization');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      EXPECTED_REVIEW_FINDINGS.filter((entry) => entry !== 'unused-option Envelope.retries'),
    );
  });

  it('counts the tests of a published module as callers of its public functions', () => {
    const pom = git(project, 'show', 'main:pom.xml');
    commitFromBranch(project, {
      name: 'published',
      from: 'review-rules',
      files: { 'pom.xml': pom.replace('</project>', DISTRIBUTION) },
    });

    const result = mavenDiffOf(project, 'published');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      EXPECTED_REVIEW_FINDINGS.filter((entry) => entry !== 'unused-option price.discount'),
    );
  });
});
