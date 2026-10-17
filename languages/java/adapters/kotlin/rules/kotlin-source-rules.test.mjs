import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CATCH_LOG_MESSAGE, CATCH_LOG_RULE } from '../../../source/catch-logging.mjs';
import {
  readCatchLogFindings,
  readTestAssertionFindings,
  TEST_ASSERTION_MESSAGE,
} from './kotlin-source-rules.mjs';
import { TEST_ASSERTION_RULE } from './kotlin-rules.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-source-rules-'));
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }
  return root;
}

const finding = (file, rule, identity, message) => ({
  tool: 'detekt',
  rule,
  path: file,
  identity,
  message,
  classification: 'enforceable',
});

describe('readCatchLogFindings', () => {
  it('flags a catch that logs without the exception, once per call, in main and test roots', () => {
    const logging = (call) =>
      `val log = LoggerFactory.getLogger(A::class.java)\nfun f() {\n  try { run() } catch (e: Exception) {\n    ${call}\n    log.error("again")\n  }\n}\n`;
    const root = projectWith({
      'src/main/kotlin/A.kt': logging('log.error("failed", e)'),
      'src/test/kotlin/ATest.kt': logging('log.warn("failed: ${e.message}")'),
      'src/main/kotlin/B.kt': 'fun g() = 1\n',
    });

    expect(readCatchLogFindings(root, ['src/main/kotlin', 'src/test/kotlin'])).toEqual([
      finding('src/main/kotlin/A.kt', CATCH_LOG_RULE, 'catch-log:log.error', CATCH_LOG_MESSAGE),
      finding('src/test/kotlin/ATest.kt', CATCH_LOG_RULE, 'catch-log:log.warn', CATCH_LOG_MESSAGE),
      finding('src/test/kotlin/ATest.kt', CATCH_LOG_RULE, 'catch-log:log.error', CATCH_LOG_MESSAGE),
    ]);
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
