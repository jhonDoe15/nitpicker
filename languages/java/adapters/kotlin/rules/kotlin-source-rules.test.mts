import { describe, expect, it } from 'vitest';
import { exceptionHint } from './test-support/kotlin-finding-views.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { CATCH_LOG_MESSAGE, CATCH_LOG_RULE } from '../../../source/catch-logging.mjs';
import {
  readCatchLogFindings as untypedReadCatchLogFindings,
  readTestAssertionFindings as untypedReadTestAssertionFindings,
  TEST_ASSERTION_MESSAGE,
} from './kotlin-source-rules.mjs';
import { TEST_ASSERTION_RULE } from './kotlin-rules.mjs';
import { useTempProjects } from './test-support/temp-projects.mts';
import { findingsOf } from './test-support/findings-list.mts';
import { readKotlinSourceFindings as untypedReadKotlinSourceFindings } from '../scan/kotlin-scan.mjs';

function readCatchLogFindings(
  projectRoot: string,
  roots: { sourceRoots: string[]; testRoots?: string[] },
): Finding[] {
  return findingsOf(Reflect.apply(untypedReadCatchLogFindings, undefined, [projectRoot, roots]));
}

function readTestAssertionFindings(
  projectRoot: string,
  testRoots: string[],
  helpers?: string[],
): Finding[] {
  return findingsOf(
    Reflect.apply(untypedReadTestAssertionFindings, undefined, [projectRoot, testRoots, helpers]),
  );
}

const readKotlinSourceFindings: (
  projectRoot: string,
  manifest: { kotlinSourceRoots: string[]; kotlinTestSourceRoots: string[] },
) => Finding[] = untypedReadKotlinSourceFindings;

const { projectWith } = useTempProjects('nitpicker-kotlin-source-rules-');

const finding = (file: string, rule: string, identity: string, message: string) => ({
  tool: 'detekt',
  rule,
  path: file,
  identity,
  message: `${message} ${exceptionHint(rule, file)}`,
  allowedForm: message,
  classification: 'enforceable',
});

describe('readCatchLogFindings', () => {
  const catching = (body: string) =>
    `val log = LoggerFactory.getLogger(A::class.java)\nfun f(): Result<Int> {\n  try { return Result.success(run()) } catch (e: Exception) {\n${body}\n  }\n}\n`;
  const files = {
    'src/main/kotlin/Swallowed.kt': catching(
      `    log.error("failed: \${e.message}")\n    return Result.success(0)`,
    ),
    'src/main/kotlin/Handled.kt': catching(
      `    log.error("failed: \${e.message}")\n    log.warn("again")\n    return Result.failure(e)`,
    ),
    'src/main/kotlin/Fixed.kt': catching(
      '    log.error("failed", e)\n    return Result.failure(e)',
    ),
    'src/main/kotlin/Rethrown.kt': catching(
      '    log.error("failed")\n    throw IllegalStateException("failed", e)',
    ),
    'src/test/kotlin/ATest.kt': catching(
      `    log.warn("failed: \${e.message}")\n    return Result.success(0)`,
    ),
    'src/main/kotlin/B.kt': 'fun g() = 1\n',
  };
  const manifest = {
    kotlinSourceRoots: ['src/main/kotlin'],
    kotlinTestSourceRoots: ['src/test/kotlin'],
  };

  it('flags a log call without the exception, once per call, in a catch that handles the error some other way', () => {
    const root = projectWith(files);

    expect(
      readCatchLogFindings(root, {
        sourceRoots: ['src/main/kotlin'],
        testRoots: ['src/test/kotlin'],
      }),
    ).toEqual([
      finding(
        'src/main/kotlin/Handled.kt',
        CATCH_LOG_RULE,
        'catch-log:log.error',
        CATCH_LOG_MESSAGE,
      ),
      finding(
        'src/main/kotlin/Handled.kt',
        CATCH_LOG_RULE,
        'catch-log:log.warn',
        CATCH_LOG_MESSAGE,
      ),
      finding('src/test/kotlin/ATest.kt', CATCH_LOG_RULE, 'catch-log:log.warn', CATCH_LOG_MESSAGE),
    ]);
  });

  it('leaves a catch that only logs to CatchOnlyLogsOrReturnsDefault in main sources, so it is reported once', () => {
    const root = projectWith(files);
    const swallowed = readKotlinSourceFindings(root, manifest)
      .filter(({ rule }) => rule === 'CatchOnlyLogsOrReturnsDefault')
      .map(({ path: file }) => file);
    const logged = readCatchLogFindings(root, {
      sourceRoots: ['src/main/kotlin'],
      testRoots: ['src/test/kotlin'],
    }).map(({ path: file }) => file);

    expect(swallowed).toEqual(['src/main/kotlin/Swallowed.kt']);
    expect(logged.filter((file) => swallowed.includes(file))).toEqual([]);
  });
});

describe('readTestAssertionFindings', () => {
  const tests = [
    'class ATest {',
    '  @Test fun asserts() { assertEquals(1, one()) }',
    '  @Test fun `matches`() { one() shouldBe 1 }',
    '  @Test fun verifies() { service.run(); verify { repo.save(any()) } }',
    '  @Test fun throws() { assertFailsWith<IllegalStateException> { fail() } }',
    '  @Test fun forgot() { service.run() }',
    '  @Test fun forgotAgain() { service.stop() }',
    '  @Test fun usesHelper() { service.run(); ensureOk(result) }',
    '}',
  ].join('\n');

  it('flags the tests that assert nothing', () => {
    const root = projectWith({ 'src/test/kotlin/ATest.kt': tests });

    expect(readTestAssertionFindings(root, ['src/test/kotlin'])).toEqual([
      finding(
        'src/test/kotlin/ATest.kt',
        TEST_ASSERTION_RULE,
        'test:forgot',
        TEST_ASSERTION_MESSAGE,
      ),
      finding(
        'src/test/kotlin/ATest.kt',
        TEST_ASSERTION_RULE,
        'test:forgotAgain',
        TEST_ASSERTION_MESSAGE,
      ),
      finding(
        'src/test/kotlin/ATest.kt',
        TEST_ASSERTION_RULE,
        'test:usesHelper',
        TEST_ASSERTION_MESSAGE,
      ),
    ]);
  });

  it("accepts the project's own assertion helpers", () => {
    const root = projectWith({ 'src/test/kotlin/ATest.kt': tests });

    expect(
      readTestAssertionFindings(root, ['src/test/kotlin'], ['ensureOk']).map(
        ({ identity }) => identity,
      ),
    ).toEqual(['test:forgot', 'test:forgotAgain']);
  });
});
