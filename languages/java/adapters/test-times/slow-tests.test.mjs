import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readSlowTestFindings, testCasesOf } from './slow-tests.mjs';
import { ADDS_SPEC, ORDER_SOURCE } from './test-support/test-sources.mjs';

const TEST_ROOT = 'src/test/java';
const ORDER_TEST = `${TEST_ROOT}/shop/OrderTest.java`;
const WAITS = 'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice';
const EXCEPTIONS = 'to "exceptions" in nitpicker.config.json.';
const FAILSAFE_ADVICE = 'or make it an integration test that Failsafe runs (*IT) if it is one';
const temporaryRoots = [];
const GROOVY_ROOT = 'src/test/groovy';

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

function findingsFor({
  sources = {},
  results,
  base,
  limits,
  snapshot = 'head',
  modulePath,
  testRoots = [TEST_ROOT],
}) {
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
    testRoots,
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
          'OrderTest totals() took 5.4 s; a unit test may take 5 s. Remove Thread.sleep and other ' +
          'waits, start a smaller Spring context or a test slice, or move it to an integration test ' +
          'source set if it is one. If this is intended, add ' +
          '{"rule":"slow-test","paths":["src/test/java/shop/OrderTest.java"],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
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
        ' an integration test may take 30 s. Remove Thread.sleep and other waits, start a smaller ' +
          'Spring context or a test slice. If this is intended, add ' +
          '{"rule":"slow-test","paths":["."],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
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
    expect(
      findingsFor({ sources: unchanged, results, base: {} }).map(({ identity }) => identity),
    ).toEqual([
      'test:shop.OrderTest#totals()',
      'test:shop.OrderTest#positive(int)[1]',
      'test:shop.OrderTest#[1] 1',
    ]);
    expect(findingsFor({ sources: unchanged, results, snapshot: 'base' })).toEqual([]);
  });

  it('leaves out an unchanged test whose file moved to another package', () => {
    const movedPath = `${TEST_ROOT}/shop/orders/OrderTest.java`;
    const moved = ORDER_SOURCE.replace('package shop;', 'package shop.orders;');
    const results = { test: suite('shop.orders.OrderTest', [['totals()', '9']]) };
    const run = (source) =>
      findingsFor({
        sources: { [movedPath]: source },
        results,
        base: { [ORDER_TEST]: ORDER_SOURCE },
      });

    expect(run(moved)).toEqual([]);
    expect(run(moved.replace('total()', 'total() + 0')).map(({ identity }) => identity)).toEqual([
      'test:shop.orders.OrderTest#totals()',
    ]);
  });

  it('counts a copy of a test whose original the change kept in another package', () => {
    const copyPath = `${TEST_ROOT}/shop/orders/OrderTest.java`;
    const copy = ORDER_SOURCE.replace('package shop;', 'package shop.orders;');
    const results = { test: suite('shop.orders.OrderTest', [['totals()', '9']]) };

    expect(
      findingsFor({
        sources: { [ORDER_TEST]: ORDER_SOURCE, [copyPath]: copy },
        results,
        base: { [ORDER_TEST]: ORDER_SOURCE },
      }).map(({ identity }) => identity),
    ).toEqual(['test:shop.orders.OrderTest#totals()']);
  });

  it('finds an inherited test in its superclass and counts it when that method or the class is new or edited', () => {
    const contractPath = `${TEST_ROOT}/shop/StoreContract.java`;
    const contract = (body) =>
      `package shop;\n\nabstract class StoreContract {\n  @Test\n  void putThenGet() {\n    ${body}\n  }\n}\n`;
    const diskPath = `${TEST_ROOT}/shop/DiskStoreTest.java`;
    const disk = 'package shop;\n\nclass DiskStoreTest extends StoreContract {\n}\n';
    const results = { test: suite('shop.DiskStoreTest', [['putThenGet()', '9']]) };
    const base = { [contractPath]: contract('store.put();'), [diskPath]: disk };
    const run = (sources) =>
      findingsFor({ sources, results, base }).map(({ path: file, location }) => [
        file,
        location?.line,
      ]);

    expect(run(base)).toEqual([]);
    expect(run({ ...base, [contractPath]: contract('store.put(); store.get();') })).toEqual([
      [contractPath, 5],
    ]);
    expect(
      findingsFor({ sources: base, results, base: { [contractPath]: contract('store.put();') } }),
    ).toHaveLength(1);
  });

  it('finds an inherited Spock feature in its Groovy base specification and counts it when edited', () => {
    const basePath = `${GROOVY_ROOT}/shop/StoreSpec.groovy`;
    const baseSpec = (body) =>
      `package shop\n\nabstract class StoreSpec extends Specification {\n  def "puts then gets"() {\n    expect: ${body}\n  }\n}\n`;
    const diskPath = `${GROOVY_ROOT}/shop/DiskStoreSpec.groovy`;
    const disk = 'package shop\n\nclass DiskStoreSpec extends StoreSpec {\n}\n';
    const results = { test: suite('shop.DiskStoreSpec', [['puts then gets', '9']]) };
    const base = { [basePath]: baseSpec('true'), [diskPath]: disk };
    const run = (sources) =>
      findingsFor({ sources, results, base, testRoots: [GROOVY_ROOT] }).map(
        ({ path: file, location }) => [file, location?.line],
      );

    expect(run(base)).toEqual([]);
    expect(run({ ...base, [basePath]: baseSpec('1 == 1') })).toEqual([[basePath, 4]]);
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
      `package shop;\n\nclass CalcTest {\n  @Nested\n  class WhenEmpty {\n    @Test\n    void ` +
      `returnsZero() {}\n  }\n\n  @Nested\n  class WhenFull {\n    @Test\n    void returnsZero() {${body}}\n  }\n}\n`;
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
          'package shop;\n\nimport shop.support.AbstractIntegrationTest;\n\nclass FlowTest extends ' +
          'AbstractIntegrationTest {\n  @Test\n  void runs() {}\n}\n',
        [`${TEST_ROOT}/shop/CheckoutTest.java`]:
          'package shop;\n\nimport shop.support.ShopTest;\n\n@ShopTest\nclass CheckoutTest {\n  @Test\n ' +
          ' void checksOut() {}\n}\n',
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

  it('finds a Spock specification under a Groovy test root and counts only its edited features', () => {
    const groovyRoot = 'src/test/groovy';
    const spec = `${groovyRoot}/shop/OrderSpec.groovy`;
    const source = (body) =>
      `package shop\n\nclass OrderSpec extends Specification {\n  def "ships an order"() {\n    expect: ${body}\n  }\n\n  def "cancels an order"() {\n    expect: true\n  }\n}\n`;
    const results = {
      test: suite('shop.OrderSpec', [
        ['ships an order', '6'],
        ['cancels an order', '6'],
      ]),
    };
    const run = (body) =>
      findingsFor({
        sources: { [spec]: source(body) },
        results,
        base: { [spec]: source('true') },
        testRoots: [TEST_ROOT, groovyRoot],
      });

    expect(run('true')).toEqual([]);
    expect(run('1 == 1')).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: spec,
        identity: 'test:shop.OrderSpec#ships an order',
        location: { line: 4 },
        message: `OrderSpec ships an order took 6.0 s; a unit test may take 5 s. ${WAITS}, or move it to an integration test source set if it is one. If this is intended, add {"rule":"slow-test","paths":["${spec}"],"reason":"..."} ${EXCEPTIONS}`,
        classification: 'enforceable',
      },
    ]);
  });

  it('counts a Spock iteration named after no feature when its file is new or a where: table changed', () => {
    const spec = `${GROOVY_ROOT}/shop/AddsSpec.groovy`;
    const results = { test: suite('shop.AddsSpec', [['one plus two', '9']]) };
    const run = (source) =>
      findingsFor({
        sources: { [spec]: source },
        results,
        base: { [spec]: ADDS_SPEC },
        testRoots: [GROOVY_ROOT],
      });

    expect(run(ADDS_SPEC.replace('    x\n', '    x + 0\n'))).toEqual([]);
    expect(
      run(ADDS_SPEC.replace('1 | 2 | 3', '2 | 2 | 4')).map(({ identity }) => identity),
    ).toEqual(['test:shop.AddsSpec#one plus two']);
  });

  it('counts a Kotest test, which names no method, when its spec file changed, without a line', () => {
    const kotlinRoot = 'src/test/kotlin';
    const spec = `${kotlinRoot}/shop/CalcSpec.kt`;
    const source = (value) =>
      `package shop\n\nclass CalcSpec : FunSpec({\n  test("doubles") { Calc().twice(3) shouldBe ${value} }\n})\n`;
    const results = { test: suite('shop.CalcSpec', [['doubles', '9']]) };
    const run = (value) =>
      findingsFor({
        sources: { [spec]: source(value) },
        results,
        base: { [spec]: source('6') },
        testRoots: [kotlinRoot],
      });

    expect(run('6')).toEqual([]);
    expect(
      run('7').map(({ path: file, identity, location }) => ({ file, identity, location })),
    ).toEqual([{ file: spec, identity: 'test:shop.CalcSpec#doubles', location: undefined }]);
  });

  it('gives Spock integration specifications the integration budget', () => {
    const findings = findingsFor({
      results: {
        test: [
          suite('shop.OrderIntegrationSpec', [['ships', '29']]),
          suite('shop.OrderISpec', [['ships', '29']]),
          suite('shop.OrderSpec', [['ships', '29']]),
        ],
      },
    });

    expect(findings.map(({ identity }) => identity)).toEqual(['test:shop.OrderSpec#ships']);
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
        message:
          `Slow crawls() took 31.0 s; an integration test may take 30 s. ${WAITS}. If this is intended, ` +
          `add {"rule":"slow-test","paths":["."],"reason":"..."} ${EXCEPTIONS}`,
        classification: 'enforceable',
      },
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: ORDER_TEST,
        identity: 'test:shop.OrderTest#totals()',
        location: { line: 5 },
        message:
          `OrderTest totals() took 6.0 s; a unit test may take 5 s. ${WAITS}, ${FAILSAFE_ADVICE}. ` +
          `If this is intended, add {"rule":"slow-test","paths":["${ORDER_TEST}"],"reason":"..."} ${EXCEPTIONS}`,
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
        message:
          `OrderTest totals() took 9.0 s; a unit test may take 5 s. ${WAITS}, ${FAILSAFE_ADVICE}. ` +
          `If this is intended, add ` +
          `{"rule":"slow-test","paths":["${modulePath}/${ORDER_TEST}"],"reason":"..."} ${EXCEPTIONS}`,
        classification: 'enforceable',
      },
    ]);
  });
});
