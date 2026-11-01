import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findingFactory } from '../review-finding.mjs';
import { routeOf } from '../test-support/facts.mjs';
import { JUNIT_HEAD } from '../test-support/sources.mjs';
import { HONESTY_RULES, testHonestyFindings } from './test-honesty.mjs';

const roots = [];
afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-honesty-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function findingsOf(root, testRoots = ['src/test/kotlin'], contextRoots = []) {
  return testHonestyFindings({
    projectRoot: root,
    testRoots,
    contextRoots,
    finding: findingFactory(),
  });
}

const SKIPPED = `${JUNIT_HEAD}class OrderTest {
    @Test
    @Disabled("later")
    fun first() { assertEquals(1, 1) }

    @Test
    fun second() {
        if (ready) assertEquals(1, 1)
    }

    @Test
    fun third() {
        CoroutineScope(Dispatchers.IO).launch { run() }
        assertEquals(1, 1)
    }
}
`;

describe('testHonestyFindings', () => {
  it('reports each rule as a pmd finding with a stable identity and the exception route', () => {
    const root = projectWith({ 'src/test/kotlin/OrderTest.kt': SKIPPED });

    const findings = findingsOf(root);

    expect(findings.map(({ rule, identity, location }) => [rule, identity, location.line])).toEqual(
      [
        ['DisabledTest', 'DisabledTest:OrderTest.first', 11],
        ['AssertionInControlFlow', 'AssertionInControlFlow:OrderTest.second:if', 16],
        ['CoroutineEscapesTest', 'CoroutineEscapesTest:OrderTest.third:launch', 21],
      ],
    );
    expect(findings[0]).toEqual({
      tool: 'pmd',
      rule: 'DisabledTest',
      path: 'src/test/kotlin/OrderTest.kt',
      identity: 'DisabledTest:OrderTest.first',
      symbol: 'OrderTest.first',
      location: { line: 11 },
      message: expect.any(String),
      classification: 'enforceable',
    });
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/DisabledTest","paths":["src/test/kotlin/OrderTest.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(HONESTY_RULES).toEqual([
      'DisabledTest',
      'FocusedTest',
      'RetryInTest',
      'AssertionInControlFlow',
      'CoroutineEscapesTest',
      'WeakAssertionInTest',
    ]);
  });

  it('reports a retry in a config file that holds no test', () => {
    const root = projectWith({
      'src/test/kotlin/ProjectConfig.kt': `package demo

import io.kotest.core.config.AbstractProjectConfig

object ProjectConfig : AbstractProjectConfig() {
    override val retries: Int? = 2
}
`,
    });

    const findings = findingsOf(root);

    expect(findings.map(({ rule, identity, location }) => [rule, identity, location.line])).toEqual(
      [['RetryInTest', 'RetryInTest:ProjectConfig:retries', 6]],
    );
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/RetryInTest","paths":["src/test/kotlin/ProjectConfig.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('keeps the identity when code above the finding moves it to another line', () => {
    const before = findingsOf(projectWith({ 'src/test/kotlin/OrderTest.kt': SKIPPED }));
    const moved = SKIPPED.replace(
      'class OrderTest {',
      '// a note\n// another note\nclass OrderTest {',
    );

    const after = findingsOf(projectWith({ 'src/test/kotlin/OrderTest.kt': moved }));

    expect(after.map(({ identity }) => identity)).toEqual(before.map(({ identity }) => identity));
    expect(after.map(({ location }) => location.line)).not.toEqual(
      before.map(({ location }) => location.line),
    );
  });

  it('numbers repeats of one finding in a test', () => {
    const text = `${JUNIT_HEAD}class OrderTest {
    @Test
    fun twice() {
        if (a) assertEquals(1, 1)
        if (b) assertEquals(2, 2)
    }
}
`;

    const findings = findingsOf(projectWith({ 'src/test/kotlin/OrderTest.kt': text }));

    expect(findings.map(({ identity }) => identity)).toEqual([
      'AssertionInControlFlow:OrderTest.twice:if',
      'AssertionInControlFlow:OrderTest.twice:if#2',
    ]);
  });

  it('reads every test root once, skips generated files and non-Kotlin sources, and tolerates a missing root', () => {
    const root = projectWith({
      'src/test/kotlin/OrderTest.kt': SKIPPED,
      'src/integrationTest/kotlin/Generated.kt': `// @generated\n${SKIPPED}`,
      'src/test/kotlin/Notes.txt': SKIPPED,
    });

    const findings = findingsOf(root, [
      'src/test/kotlin',
      'src/test/kotlin',
      'src/integrationTest/kotlin',
      'src/missing/kotlin',
    ]);

    expect(findings.map(({ path: file }) => file)).toEqual(
      Array(3).fill('src/test/kotlin/OrderTest.kt'),
    );
  });

  it('finds a Main dispatcher rule in a shared module and needs the test class to apply it', () => {
    const delaying = (member) => `${JUNIT_HEAD}class ClockTest {
${member}    @Test
    fun main() = runTest {
        withContext(Dispatchers.Main) { delay(500) }
    }
}
`;
    const rule = `class MainRule : TestWatcher() {
    override fun starting(description: Description) { Dispatchers.setMain(StandardTestDispatcher()) }
}
`;
    const withRule = (member) =>
      projectWith({
        'src/test/kotlin/ClockTest.kt': delaying(member),
        'test-utils/src/main/kotlin/MainRule.kt': rule,
      });
    const contextRoots = ['test-utils/src/main/kotlin'];

    expect(findingsOf(withRule(''), ['src/test/kotlin'], contextRoots)).toHaveLength(1);
    expect(
      findingsOf(
        withRule('    @get:Rule val main = MainRule()\n'),
        ['src/test/kotlin'],
        contextRoots,
      ),
    ).toEqual([]);
  });

  it('is empty without test roots', () => {
    expect(findingsOf(projectWith({}), [])).toEqual([]);
  });
});
