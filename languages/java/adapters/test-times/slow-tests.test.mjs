import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readSlowTestFindings, testCasesOf } from './slow-tests.mjs';
import { testMethod } from './test-methods.mjs';

const TEST_ROOT = 'src/test/java';
const ORDER_TEST = `${TEST_ROOT}/shop/OrderTest.java`;
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
          'OrderTest totals() took 5.4 s; a unit test may take 5 s. Remove Thread.sleep and other waits, start a smaller Spring context or a test slice, or move it to an integration test source set if it is one. If this is intended, add {"rule":"test-runtime/slow-test","paths":["src/test/java/shop/OrderTest.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
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
        ' an integration test may take 30 s. Remove Thread.sleep and other waits, start a smaller Spring context or a test slice. If this is intended, add {"rule":"test-runtime/slow-test","paths":["."],"reason":"..."} to "exceptions" in nitpicker.config.json.',
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

    expect(findings.map(({ identity, message }) => [identity, message.split(';')[1]])).toEqual([
      ['test:shop.Slow#crawls()', expect.stringContaining(' an integration test may take 30 s')],
      ['test:shop.OrderTest#totals()', expect.stringContaining(' a unit test may take 5 s')],
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
    const [finding] = run(edited);
    expect(finding.path).toBe(ORDER_TEST);
    expect(finding.message).toContain(`"paths":["${modulePath}/${ORDER_TEST}"]`);
  });
});
