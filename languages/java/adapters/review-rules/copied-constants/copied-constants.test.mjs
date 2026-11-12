import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COPIED_CONSTANT_RULE, readCopiedConstantFindings } from './copied-constants.mjs';

const roots = [];
const PROJECT = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};
const LIMITS = [
  'package shop;',
  'public final class Limits {',
  '  public static final int MAX_ITEMS = 50;',
  '  static final String DEFAULT_REGION = "eu-west-1";',
  '  public static final long TIMEOUT_MS = 5_000L;',
  '  public static final double MIN_BALANCE = -25.5;',
  '  private static final int HIDDEN = 77;',
  '  public static final int RETRY_LIMIT = 2;',
  '  public static final int SUM = 40 + 2;',
  '  public static final int maxDepth = 9;',
  '}',
].join('\n');

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-copied-'));
  roots.push(root);
  for (const [file, text] of Object.entries({
    'src/main/java/shop/Limits.java': LIMITS,
    ...files,
  })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function findings(files, options = {}) {
  const root = projectWith(files);
  return readCopiedConstantFindings(root, { projects: [PROJECT], kotlin: true, ...options }).map(
    ({ tool, rule, path: file, location, message }) => ({
      tool,
      rule,
      file,
      line: location.line,
      message,
    }),
  );
}

function javaTest(body, header = 'package shop;') {
  return { 'src/test/java/shop/LimitsTest.java': `${header}\nclass LimitsTest {\n${body}\n}` };
}

describe('copied constants in JVM tests', () => {
  it('reports a Java test literal that copies a constant of a class the test uses', () => {
    const found = findings(
      javaTest(
        [
          '  @Test void caps() {',
          '    assertEquals(50, new Cart(Limits.class).limit());',
          '    assertEquals("eu-west-1", region());',
          '    assertEquals(5000, timeout());',
          '    assertEquals(-25.5, balance(), 0.0);',
          '  }',
        ].join('\n'),
      ),
    );

    const { message, ...where } = found[0];

    expect(found.map(({ line }) => line)).toEqual([4, 5, 6, 7]);
    expect(where).toEqual({
      tool: 'pmd',
      rule: COPIED_CONSTANT_RULE,
      file: 'src/test/java/shop/LimitsTest.java',
      line: 4,
    });
    expect(message).toBe(
      'This literal copies Limits.MAX_ITEMS from src/main/java/shop/Limits.java: when Limits.MAX_ITEMS changes, the test keeps checking the old value or stops testing the case it was written for. Use Limits.MAX_ITEMS (or an expression on it, such as Limits.MAX_ITEMS + 1). If the value is a contract the test pins on purpose, assert it next to the constant: assertEquals(50, Limits.MAX_ITEMS). If this is intended, add {"rule":"pmd/CopiedConstantInTest","paths":["src/test/java/shop/LimitsTest.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(found[1].message).toBe(
      'This literal copies Limits.DEFAULT_REGION from src/main/java/shop/Limits.java: when Limits.DEFAULT_REGION changes, the test keeps checking the old value or stops testing the case it was written for. Use Limits.DEFAULT_REGION (or build the text from it). If the value is a contract the test pins on purpose, assert it next to the constant: assertEquals("eu-west-1", Limits.DEFAULT_REGION). If this is intended, add {"rule":"pmd/CopiedConstantInTest","paths":["src/test/java/shop/LimitsTest.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('does not report pins, trivial values, annotations, private or computed constants', () => {
    const found = findings(
      javaTest(
        [
          '  @Timeout(50) @DisplayName("eu-west-1") void pins() {',
          '    assertEquals(50, Limits.MAX_ITEMS);',
          '    assertThat(Limits.DEFAULT_REGION)',
          '        .isEqualTo("eu-west-1");',
          '    assertEquals(2, retries());',
          '    assertEquals(77, hidden());',
          '    assertEquals(42, sum());',
          '    assertEquals(9, depth());',
          '  }',
        ].join('\n'),
      ),
    );

    expect(found).toEqual([]);
  });

  it('needs the owner to be named and visible in the test', () => {
    const unnamed = findings(javaTest('  void x() { assertEquals(50, limit()); }'));
    const otherPackage = findings({
      'src/test/java/other/LimitsTest.java':
        'package other;\nclass T { void x() { Limits l; assertEquals(50, l.max()); } }',
    });
    const imported = findings({
      'src/test/java/other/LimitsTest.java':
        'package other;\nimport shop.Limits;\nclass T { void x() { Limits l; assertEquals(50, l.max()); } }',
    });
    const staticImport = findings({
      'src/test/java/other/LimitsTest.java':
        'package other;\nimport static shop.Limits.MAX_ITEMS;\nclass T { void x() { assertEquals(50, max()); assertEquals(MAX_ITEMS, max()); } }',
    });

    expect([unnamed.length, otherPackage.length, imported.length, staticImport.length]).toEqual([
      0, 0, 1, 1,
    ]);
  });

  it('reads constants of nested types and the names that reach them', () => {
    const api = [
      'package shop;',
      'public final class Api {',
      '  public static final class Paging { public static final int PAGE_SIZE = 25; }',
      '  interface Headers { String TRACE = "x-trace-id"; }',
      '  private static final class Secret { static final int CODE = 4242; }',
      '  public enum Mode { ON; public static final int RETRY_CAP = 7; }',
      '}',
    ].join('\n');
    const test = (header, body) => ({
      'src/main/java/shop/Api.java': api,
      'src/test/java/other/ApiTest.java': `${header}\nclass ApiTest { void x() { ${body} } }`,
    });
    const count = (header, body) => findings(test(header, body)).length;
    const samePackage = findings({
      'src/main/java/shop/Api.java': api,
      ...javaTest(
        '  void x() { Api.of(); f(25); f("x-trace-id"); f(4242); f(7); f(25, Api.Paging.PAGE_SIZE); }',
      ),
    });

    expect(samePackage.map(({ message }) => message.split(' from ')[0])).toEqual([
      'This literal copies Api.Paging.PAGE_SIZE',
      'This literal copies Api.Headers.TRACE',
      'This literal copies Api.Mode.RETRY_CAP',
    ]);
    expect([
      count('package other;\nimport shop.Api.Paging;', 'Paging.of(); f(25);'),
      count('package other;\nimport shop.Api.*;', 'Paging.of(); f(25);'),
      count('package other;\nimport shop.Api;', 'Api.of(); f(25);'),
      count('package other;\nimport static shop.Api.Paging.PAGE_SIZE;', 'f(25);'),
      count('package other;\nimport static shop.Api.Paging.*;', 'f(25);'),
      count('package other;\nimport shop.*;', 'Paging.of(); f(25);'),
      count('package other;\nimport shop.Api.Paging;', 'f(25);'),
    ]).toEqual([1, 1, 1, 1, 1, 0, 0]);
  });

  it('reads Kotlin nested objects and companions of nested classes', () => {
    const found = findings({
      'src/main/kotlin/shop/Store.kt': [
        'package shop',
        'class Store {',
        '  object Keys { const val CART_KEY = "cart-v2" }',
        '  class Shelf { companion object { const val SHELF_SIZE = 30 } }',
        '  private object Hidden { const val HIDDEN_KEY = "hidden-v1" }',
        '}',
      ].join('\n'),
      'src/test/kotlin/other/StoreTest.kt': [
        'package other',
        'import shop.Store.Keys',
        'import shop.Store.Shelf as S',
        'fun t() {',
        '  Keys.of(); S.of()',
        '  key() shouldBe "cart-v2"',
        '  size() shouldBe 30',
        '  hidden() shouldBe "hidden-v1"',
        '}',
      ].join('\n'),
    });

    expect(
      found.map(({ line, message }) => `${String(line)} ${message.split(' from ')[0]}`),
    ).toEqual([
      '6 This literal copies Store.Keys.CART_KEY',
      '7 This literal copies Store.Shelf.SHELF_SIZE',
    ]);
  });

  it('reads Kotlin constants and Kotlin tests, with Kotest names skipped', () => {
    const found = findings({
      'src/main/kotlin/shop/Config.kt': [
        'package shop',
        'const val PORT = 8080',
        'private const val SECRET_PORT = 9090',
        'object Regions { const val HOME_REGION = "us-east-2" }',
        'class Cart { companion object { const val MAX_LINES = 12 } }',
      ].join('\n'),
      'src/test/kotlin/shop/ConfigTest.kt': [
        'package shop',
        'class ConfigTest : StringSpec({',
        '  "us-east-2" { server().port shouldBe 8080 }',
        '  test("12") { Regions.HOME_REGION shouldBe "us-east-2" }',
        '  should("cap") {',
        '    val lines = Cart.MAX_LINES',
        '    lines shouldBe 12',
        '    assertEquals(',
        '      12,',
        '      Cart.MAX_LINES,',
        '    )',
        '    secret() shouldBe 9090',
        '    Limits.MAX_ITEMS shouldBe 50',
        '    limit() shouldBe 50',
        '  }',
        '})',
      ].join('\n'),
    });

    expect(
      found.map(({ line, message }) => `${String(line)} ${message.split(' from ')[0]}`),
    ).toEqual([
      '3 This literal copies PORT',
      '7 This literal copies Cart.MAX_LINES',
      '14 This literal copies Limits.MAX_ITEMS',
    ]);
  });

  it('reads the expected value of kotlin.test expect and Java strings with a dollar sign', () => {
    const found = findings({
      'src/main/java/shop/Money.java':
        'package shop;\npublic class Money { public static final String SYMBOL = "US$"; }',
      'src/test/kotlin/shop/LimitsTest.kt':
        'package shop\nfun t() { Limits.of(); expect(50) { limit() } }',
      'src/test/java/shop/MoneyTest.java':
        'package shop;\nclass MoneyTest { void x() { Money m; assertEquals("US$", m.symbol()); } }',
    });

    expect(found.map(({ file, line }) => `${file}:${String(line)}`)).toEqual([
      'src/test/java/shop/MoneyTest.java:2',
      'src/test/kotlin/shop/LimitsTest.kt:2',
    ]);
  });

  it('reads Java octal numbers, skips labels after this@ and keeps identities per file', () => {
    const files = {
      'src/test/java/shop/ATest.java':
        'package shop;\nclass ATest { void x() { Limits l; f(062); f(050); } }',
      'src/test/java/shop/BTest.java':
        'package shop;\nclass BTest { void x() { Limits l; f(50); } }',
      'src/test/kotlin/shop/CTest.kt':
        'package shop\nclass CTest { fun x() { Limits.of(); this@CTest.f(50) } }',
    };
    const root = projectWith(files);
    const read = () =>
      readCopiedConstantFindings(root, { projects: [PROJECT], kotlin: true }).map(
        ({ path: file, identity }) => `${file} ${identity}`,
      );

    expect(read()).toEqual([
      'src/test/java/shop/ATest.java CopiedConstantInTest:Limits.MAX_ITEMS:number:50',
      'src/test/java/shop/BTest.java CopiedConstantInTest:Limits.MAX_ITEMS:number:50',
      'src/test/kotlin/shop/CTest.kt CopiedConstantInTest:Limits.MAX_ITEMS:number:50',
    ]);
  });

  it('skips test sources outside the Kotlin preset and excluded files', () => {
    const files = {
      'src/main/kotlin/shop/Config.kt': 'package shop\nconst val PORT = 8080',
      'src/test/kotlin/shop/ConfigTest.kt': 'package shop\nfun t() { port() shouldBe 8080 }',
      ...javaTest('  void x() { Limits l; assertEquals(50, l.max()); }'),
    };

    expect(findings(files, { kotlin: false })).toHaveLength(1);
    expect(findings(files, { policy: { exclude: ['src/test/java/**'] } })).toHaveLength(1);
  });
});
