import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../../core/diff/comparison/finding-schema.mjs';
import { KOTLIN_EXCEPTION_RULES, validateKotlinOptions } from '../kotlin-options.mjs';
import { buildViews } from './build-view.mjs';
import { readKotlinFacts } from './kotlin-facts.mjs';
import { readKotlinReviewFindings } from './review-findings.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from './review-rules.mjs';
import { SPRING_RULES } from './spring/spring-messages.mjs';
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

    expect(readKotlinFacts(missing.reportRoot)).toEqual({ files: [], skipped: [] });
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

describe('readKotlinReviewFindings on the test sources', () => {
  it.each([
    ['next to the facts', { files: [testFile()] }],
    ['when the facts report lists no files', { files: [] }],
  ])('reads the Kotlin test sources of the manifest %s', (_name, facts) => {
    const { root, reportRoot } = projectWith(facts);
    mkdirSync(path.join(root, 'src/test/kotlin'), { recursive: true });
    writeFileSync(
      path.join(root, 'src/test/kotlin/SkippedTest.kt'),
      'class SkippedTest {\n    @Test\n    @Disabled\n    fun later() { assertEquals(1, 1) }\n}\n',
    );

    const findings = readKotlinReviewFindings({
      reportRoot,
      projectRoot: root,
      manifest: { kotlinTestSourceRoots: ['src/test/kotlin'] },
    });

    expect(
      findings.map(({ tool, rule, path: file, location }) => [tool, rule, file, location.line]),
    ).toEqual([['pmd', 'DisabledTest', 'src/test/kotlin/SkippedTest.kt', 3]]);
    expect(() => parseAnalyzerReport({ findings }, 'kotlin')).not.toThrow();
  });
});

describe('readKotlinReviewFindings across the project', () => {
  function twoModules(own, sibling) {
    const first = projectWith(own);
    const second = projectWith(sibling);
    return {
      first,
      modules: [
        { reportRoot: first.reportRoot, path: ':', manifest: { sourceRoots: [] } },
        { reportRoot: second.reportRoot, path: ':billing', manifest: { sourceRoots: [] } },
      ],
    };
  }

  it('reads a test fake of a class declared in a sibling module as a fake of a main class', () => {
    const fake = testFile({
      classes: [klass('SampleTest'), klass('FakeClock', { supers: ['Clock'] })],
      functions: [testMethod()],
      waits: [
        wait('sleep', {
          scopes: [
            { k: 'fun', name: 'now' },
            { k: 'class', name: 'FakeClock', qualified: 'FakeClock', supers: ['Clock'] },
          ],
        }),
      ],
    });
    const { first, modules } = twoModules(
      { files: [fake] },
      { files: [file({ classes: [klass('Clock', { kind: 'interface' })] })] },
    );
    const context = { reportRoot: first.reportRoot, projectRoot: first.root, manifest: {} };

    expect(readKotlinReviewFindings(context)).toHaveLength(1);
    expect(readKotlinReviewFindings({ ...context, modules })).toEqual([]);
  });

  it('judges a public option by its own published flag and the Java sources of every module', () => {
    const format = fn('format', {
      parameters: [parameter('value', 'Int'), parameter('pad', 'Int', { default: true })],
    });
    const { first, modules } = twoModules(
      {
        files: [
          file({ functions: [format], calls: [call('format', { positional: 1 })] }),
          testFile({ calls: [call('format', { positional: 2 })] }),
        ],
      },
      { files: [] },
    );
    const context = { reportRoot: first.reportRoot, projectRoot: first.root, manifest: {} };
    const javaRoot = path.join(first.root, 'billing/src/main/java');
    const judgedWith = (index, manifest) =>
      readKotlinReviewFindings({
        ...context,
        modules: modules.map((module, at) =>
          at === index ? { ...module, manifest: { ...module.manifest, ...manifest } } : module,
        ),
      });

    expect(judgedWith(0, {})).toHaveLength(1);
    expect(judgedWith(0, { published: true })).toEqual([]);
    mkdirSync(javaRoot, { recursive: true });
    writeFileSync(path.join(javaRoot, 'Bill.java'), 'class Bill { int a = Kt.format(1, 2); }\n');
    expect(judgedWith(1, { sourceRoots: ['billing/src/main/java'] })).toEqual([]);
    expect(
      judgedWith(1, {
        kotlinCallerGaps: [{ label: 'the included build tools', reaches: [':'] }],
      }).map(({ symbol, classification }) => `${symbol} ${classification}`),
    ).toEqual(['callers-not-analyzed descriptive']);
  });

  it('reads the facts of the build once for every module of a report', () => {
    const { first, modules } = twoModules({ files: [file()] }, { files: [testFile()] });
    const views = buildViews();
    const view = views({ reportRoot: first.reportRoot, projectRoot: first.root, modules });

    expect(views({ reportRoot: modules[1].reportRoot, projectRoot: first.root, modules })).toBe(
      view,
    );
    expect(view.files.map(({ test }) => test)).toEqual([false, true]);
  });

  it('does not stop at a Kotlin name that is not a valid pattern when it scans Java sources', () => {
    const { root, reportRoot } = projectWith({
      files: [
        file({
          functions: [
            fn('weird (name', {
              visibility: 'private',
              parameters: [parameter('a', 'Int'), parameter('b', 'Int', { default: true })],
            }),
          ],
          calls: [call('weird (name', { positional: 1 })],
        }),
      ],
    });
    mkdirSync(path.join(root, 'src/main/java'), { recursive: true });
    writeFileSync(path.join(root, 'src/main/java/A.java'), 'class A {}\n');

    const findings = readKotlinReviewFindings({
      reportRoot,
      projectRoot: root,
      manifest: { sourceRoots: ['src/main/java'] },
    });

    expect(findings).toHaveLength(1);
  });

  it('leaves a file whose collection was skipped out of the facts', () => {
    const { reportRoot } = projectWith({ files: [{ file: 'a.kt', test: false, skipped: true }] });

    expect(readKotlinFacts(reportRoot)).toEqual({
      files: [],
      skipped: [{ file: 'a.kt', test: false }],
    });
  });
});

describe('Kotlin exception rules for the review rules', () => {
  it('lists each rule as it is printed and accepts an exception for it', () => {
    expect(KOTLIN_REVIEW_EXCEPTION_RULES).toEqual([
      'pmd/FixedSleepInTest',
      'pmd/NegativeWaitInTest',
      'pmd/DisabledTest',
      'pmd/FocusedTest',
      'pmd/AssertionInControlFlow',
      'pmd/CoroutineEscapesTest',
      'pmd/SpringUnusedContext',
      'pmd/ExhaustiveEnumPredicate',
      'pmd/StaticForwardingWrapper',
      'pmd/SingularAndPluralMember',
      ...SPRING_RULES.map((rule) => `pmd/${rule}`),
      'pmd/SpringQueryConcatenation',
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

  const onKotlinSource = (rule) => ({
    preset: 'kotlin',
    exceptions: [{ rule, paths: ['src/main/kotlin/demo/A.kt'], reason: 'x' }],
  });

  it.each(['pmd/SpringConstructorInjection', 'pmd/JpaLazyFetching', 'pmd/SpringDataNoSaveInLoop'])(
    'accepts an exception for %s on a Kotlin source, where the Kotlin rule reports it',
    (rule) => {
      expect(() => {
        validateKotlinOptions(onKotlinSource(rule));
      }).not.toThrow();
    },
  );

  it('rejects a pmd id no Kotlin rule prints when its paths name only Kotlin sources', () => {
    expect(() => {
      validateKotlinOptions(onKotlinSource('pmd/SpringFieldInjection'));
    }).toThrow('reported in .java files only: its paths name Kotlin sources');
  });
});
