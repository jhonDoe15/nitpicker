import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readSlowTestFindings, testCasesOf } from './slow-tests.mjs';
import { testMethod } from './test-methods.mjs';

const TEST_ROOT = 'src/test/java';
const ORDER_TEST = `${TEST_ROOT}/shop/OrderTest.java`;
const WAITS = 'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice';
const EXCEPTIONS = 'to "exceptions" in nitpicker.config.json.';
const FAILSAFE_ADVICE = 'or make it an integration test that Failsafe runs (*IT) if it is one';
const temporaryRoots = [];

const ORDER_SOURCE = `package shop;

class OrderTest {
  @Test
  void totals() {
    assertEquals(3, total());
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 2})
  void positive(int value) {
    assertTrue(value > 0);
  }
}
`;

function directoryWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-tests-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function suite(className, cases) {
  const testCases = cases
    .map(([name, time]) => `  <testcase name="${name}" classname="${className}" time="${time}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${className}">\n${testCases}\n</testsuite>\n`;
}

function findingsFor({ sources = {}, results, base, limits, snapshot = 'head', modulePath }) {
  const reportRoot = directoryWith(
    Object.fromEntries(
      Object.entries(results).flatMap(([task, xml]) =>
        [xml].flat().map((text, index) => [`test-results/${task}/TEST-${String(index)}.xml`, text]),
      ),
    ),
  );
  const baseline = { snapshot, baselineRoot: base === undefined ? undefined : directoryWith(base) };
  return readSlowTestFindings({
    reportRoot,
    projectRoot: directoryWith(sources),
    testRoots: [TEST_ROOT],
    limits,
    baseline,
    modulePath,
  });
}

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('testCasesOf', () => {
  it('reads Gradle and Surefire testcases with their time in seconds', () => {
    const xml = `<testsuites>${suite('shop.OrderTest', [
      ['[1] 1', '0.25'],
      ['positive(int)[2]', '1,234.5'],
    ])}</testsuites>`.replace('<?xml version="1.0" encoding="UTF-8"?>\n', '');

    expect(testCasesOf(xml, 'test')).toEqual([
      { task: 'test', className: 'shop.OrderTest', name: '[1] 1', seconds: 0.25 },
      { task: 'test', className: 'shop.OrderTest', name: 'positive(int)[2]', seconds: 1234.5 },
    ]);
  });
});

describe('testMethod', () => {
  it('finds a method by its call name, its Surefire name or its display name, with its annotations', () => {
    const named = `class A {\n  @Test\n  @DisplayName("adds \\"two\\"")\n  void adds() { if (x) { y(); } }\n}\n`;

    expect(testMethod(ORDER_SOURCE, 'positive(int)[1]')).toEqual({
      line: 11,
      text: '@ParameterizedTest\n@ValueSource(ints = {1, 2})\nvoid positive(int value) {\nassertTrue(value > 0);\n}',
    });
    expect(testMethod(ORDER_SOURCE, 'totals')?.line).toBe(5);
    expect(testMethod(named, 'adds "two"')?.line).toBe(4);
    expect(testMethod(ORDER_SOURCE, '[1] 1')).toBeUndefined();
  });

  it('finds a JUnit 4 parameterized case and a @TestFactory that returns dynamic tests', () => {
    const source = `class A {
  @Test
  public void adds() {}

  @TestFactory
  Stream<DynamicTest> grows() {
    return Stream.of();
  }

  @TestFactory
  DynamicTest[] shrinks() {
    return new DynamicTest[0];
  }
}
`;

    expect(
      ['adds[0]', 'grows()', 'grows()[1]', 'shrinks()'].map(
        (name) => testMethod(source, name)?.line,
      ),
    ).toEqual([3, 6, 6, 11]);
  });

  it('looks for a @Nested test inside its own class, and an outer test outside nested ones', () => {
    const source = `class CalcTest {
  @Nested
  class WhenEmpty {
    @Test
    void returnsZero() {}
  }

  @Nested
  class WhenFull {
    @Test
    void returnsZero() {}
  }

  @Test
  void returnsZero() {}
}
`;

    expect(
      ['CalcTest$WhenEmpty', 'CalcTest$WhenFull', 'CalcTest', 'CalcTest$Missing'].map(
        (className) => testMethod(source, 'returnsZero()', className)?.line,
      ),
    ).toEqual([5, 11, 15, undefined]);
  });

  it('finds a Kotlin test named with backticks', () => {
    const kotlin = 'class KTest {\n  @Test\n  fun `ships an order`() {\n    check(true)\n  }\n}\n';

    expect(testMethod(kotlin, 'ships an order()')?.line).toBe(3);
  });
});

describe('readSlowTestFindings', () => {
  it('fails a unit test over 5 s with the budget, the time, the fixes and the exception route', () => {
    const findings = findingsFor({
      sources: { [ORDER_TEST]: ORDER_SOURCE },
      results: {
        test: suite('shop.OrderTest', [
          ['totals()', '5.4'],
          ['[1] 1', '4.9'],
        ]),
      },
    });

    expect(findings).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: ORDER_TEST,
        identity: 'test:shop.OrderTest#totals()',
        location: { line: 5 },
        message:
          'OrderTest totals() took 5.4 s; a unit test may take 5 s. Remove Thread.sleep and other waits, start a smaller Spring context or a test slice, or move it to an integration test source set if it is one. If a reviewer agrees this is intended, add {"rule":"test-runtime/slow-test","paths":["src/test/java/shop/OrderTest.java"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });

  it('gives integration tests 30 s: other test tasks, *IT classes and @SpringBootTest', () => {
    const boot = `${TEST_ROOT}/shop/BootTest.java`;
    const findings = findingsFor({
      sources: { [boot]: '@SpringBootTest\nclass BootTest {\n  @Test\n  void starts() {}\n}\n' },
      results: {
        test: [
          suite('shop.BootTest', [['starts()', '29']]),
          suite('shop.OrderIT', [['a()', '31']]),
        ],
        integrationTest: suite('shop.Flow', [['runs()', '12']]),
      },
    });

    expect(findings.map(({ identity, message }) => [identity, message.split(';')[1]])).toEqual([
      [
        'test:shop.OrderIT#a()',
        ' an integration test may take 30 s. Remove Thread.sleep and other waits, start a smaller Spring context or a test slice. If a reviewer agrees this is intended, add {"rule":"test-runtime/slow-test","paths":["."],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
  });

  it('keeps the slowest run of a rerun test and honours configured limits', () => {
    const findings = findingsFor({
      sources: { [ORDER_TEST]: ORDER_SOURCE },
      results: {
        test: suite('shop.OrderTest', [
          ['totals()', '1.5'],
          ['totals()', '2.5'],
        ]),
      },
      limits: { unitTestSeconds: 2 },
    });

    expect(findings.map(({ message }) => message.split(';')[0])).toEqual([
      'OrderTest totals() took 2.5 s',
    ]);
  });

  it('fails only tests the change adds or edits, and nothing on the base snapshot', () => {
    const edited = ORDER_SOURCE.replace('value > 0', 'value >= 1');
    const results = {
      test: suite('shop.OrderTest', [
        ['totals()', '9'],
        ['positive(int)[1]', '9'],
        ['[1] 1', '9'],
      ]),
    };
    const unchanged = { [ORDER_TEST]: ORDER_SOURCE };

    expect(findingsFor({ sources: unchanged, results, base: unchanged })).toEqual([]);
    expect(
      findingsFor({ sources: { [ORDER_TEST]: edited }, results, base: unchanged }).map(
        ({ identity, location }) => [identity, location?.line],
      ),
    ).toEqual([
      ['test:shop.OrderTest#positive(int)[1]', 11],
      ['test:shop.OrderTest#[1] 1', undefined],
    ]);
    expect(findingsFor({ sources: unchanged, results, base: {} })).toHaveLength(3);
    expect(findingsFor({ sources: unchanged, results, snapshot: 'base' })).toEqual([]);
  });

  it('counts a case named after no method only when its file is new or a parameterized test changed', () => {
    const results = { test: suite('shop.OrderTest', [['[1] 1', '9']]) };
    const base = { [ORDER_TEST]: ORDER_SOURCE };
    const run = (source) => findingsFor({ sources: { [ORDER_TEST]: source }, results, base });

    expect(run(ORDER_SOURCE.replace('total()', 'total() + 0'))).toEqual([]);
    expect(
      run(ORDER_SOURCE.replace('ints = {1, 2}', 'ints = {1, 3}')).map(({ identity }) => identity),
    ).toEqual(['test:shop.OrderTest#[1] 1']);
  });

  it('attributes a @Nested test to its own class and names it with a dot', () => {
    const calc = `${TEST_ROOT}/shop/CalcTest.java`;
    const source = (body) =>
      `package shop;\n\nclass CalcTest {\n  @Nested\n  class WhenEmpty {\n    @Test\n    void returnsZero() {}\n  }\n\n  @Nested\n  class WhenFull {\n    @Test\n    void returnsZero() {${body}}\n  }\n}\n`;
    const results = { test: suite('shop.CalcTest$WhenFull', [['returnsZero()', '9']]) };
    const run = (body) =>
      findingsFor({ sources: { [calc]: source(body) }, results, base: { [calc]: source('') } });

    expect(run('')).toEqual([]);
    expect(
      run(' sleep(); ').map(({ location, message }) => [location, message.split(' took')[0]]),
    ).toEqual([[{ line: 13 }, 'CalcTest.WhenFull returnsZero()']]);
  });

  it('gives the integration budget to tests whose superclass or annotation is a @SpringBootTest', () => {
    const support = `${TEST_ROOT}/shop/support`;
    const findings = findingsFor({
      sources: {
        [`${support}/AbstractIntegrationTest.java`]:
          'package shop.support;\n\n@SpringBootTest\npublic abstract class AbstractIntegrationTest {}\n',
        [`${support}/ShopTest.java`]:
          'package shop.support;\n\n@Retention(RUNTIME)\n@SpringBootTest\npublic @interface ShopTest {}\n',
        [`${TEST_ROOT}/shop/FlowTest.java`]:
          'package shop;\n\nimport shop.support.AbstractIntegrationTest;\n\nclass FlowTest extends AbstractIntegrationTest {\n  @Test\n  void runs() {}\n}\n',
        [`${TEST_ROOT}/shop/CheckoutTest.java`]:
          'package shop;\n\nimport shop.support.ShopTest;\n\n@ShopTest\nclass CheckoutTest {\n  @Test\n  void checksOut() {}\n}\n',
        [ORDER_TEST]: ORDER_SOURCE,
      },
      results: {
        test: [
          suite('shop.FlowTest', [['runs()', '6']]),
          suite('shop.CheckoutTest', [['checksOut()', '6']]),
          suite('shop.OrderTest', [['totals()', '6']]),
        ],
      },
    });

    expect(findings.map(({ identity }) => identity)).toEqual(['test:shop.OrderTest#totals()']);
  });

  it('reports a test whose source is missing on the project root path', () => {
    const findings = findingsFor({ results: { test: suite('gen.Made', [['x()', '6']]) } });

    expect(findings.map(({ path: file, identity }) => [file, identity])).toEqual([
      ['.', 'test:gen.Made#x()'],
    ]);
  });

  it('counts Surefire results as unit tests and Failsafe results as integration tests', () => {
    const findings = findingsFor({
      sources: { [ORDER_TEST]: ORDER_SOURCE },
      results: {
        surefire: suite('shop.OrderTest', [['totals()', '6']]),
        failsafe: [
          suite('shop.Flow', [['runs()', '12']]),
          suite('shop.Slow', [['crawls()', '31']]),
        ],
      },
    });

    expect(findings).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: '.',
        identity: 'test:shop.Slow#crawls()',
        message: `Slow crawls() took 31.0 s; an integration test may take 30 s. ${WAITS}. If a reviewer agrees this is intended, add {"rule":"test-runtime/slow-test","paths":["."],"reason":"<why this is intended>"} ${EXCEPTIONS}`,
        classification: 'enforceable',
      },
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: ORDER_TEST,
        identity: 'test:shop.OrderTest#totals()',
        location: { line: 5 },
        message: `OrderTest totals() took 6.0 s; a unit test may take 5 s. ${WAITS}, ${FAILSAFE_ADVICE}. If a reviewer agrees this is intended, add {"rule":"test-runtime/slow-test","paths":["${ORDER_TEST}"],"reason":"<why this is intended>"} ${EXCEPTIONS}`,
        classification: 'enforceable',
      },
    ]);
  });

  it('compares a module test with the base file under the module path', () => {
    const modulePath = 'services/core';
    const inBase = (text) => ({ [`${modulePath}/${ORDER_TEST}`]: text });
    const results = { surefire: suite('shop.OrderTest', [['totals()', '9']]) };
    const edited = ORDER_SOURCE.replace('total()', 'total() + 0');
    const run = (source) =>
      findingsFor({
        sources: { [ORDER_TEST]: source },
        results,
        base: inBase(ORDER_SOURCE),
        modulePath,
      });

    expect(run(ORDER_SOURCE)).toEqual([]);
    expect(run(edited)).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: ORDER_TEST,
        identity: 'test:shop.OrderTest#totals()',
        location: { line: 5 },
        message: `OrderTest totals() took 9.0 s; a unit test may take 5 s. ${WAITS}, ${FAILSAFE_ADVICE}. If a reviewer agrees this is intended, add {"rule":"test-runtime/slow-test","paths":["${modulePath}/${ORDER_TEST}"],"reason":"<why this is intended>"} ${EXCEPTIONS}`,
        classification: 'enforceable',
      },
    ]);
  });
});
