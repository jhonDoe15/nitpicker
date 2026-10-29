import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageWeakenedTests } from './weakened.mjs';

const detect = (fixture, final) => detectLanguageWeakenedTests(toTree(fixture), toTree(final));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);

const JAVA_TEST = 'src/test/java/demo/CartTest.java';
const JAVA_MAIN = { 'src/main/java/demo/Cart.java': 'class Cart {}' };
const SUMS = `  @Test
  void sumsLines() {
    Cart cart = new Cart();
    assertEquals(0, cart.total());
    assertEquals(5, cart.add(5).total());
  }
`;
const NESTED = `  @Nested
  class Discounts {
    @Test
    @SuppressWarnings("unused")
    void rejectsNegative() {
      assertThrows(IllegalArgumentException.class, () -> new Cart().discount(-1));
    }
  }
`;
const javaClass = (...members) => `package demo;\n\nclass CartTest {\n${members.join('\n')}}\n`;
const withJava = (...members) => ({ ...JAVA_MAIN, [JAVA_TEST]: javaClass(...members) });
const javaFixture = withJava(SUMS, NESTED);
const sumsWith = (replacement) => SUMS.replace('    assertEquals(0, cart.total());', replacement);

const KOTLIN_TEST = 'src/test/kotlin/demo/CartTest.kt';
const KOTLIN_MAIN = { 'src/main/kotlin/demo/Cart.kt': 'class Cart' };
const SUMS_KT = `    @Test
    fun \`sums lines\`() {
        val cart = Cart()
        assertEquals(0, cart.total())
        assertEquals(5, cart.add(5).total())
    }
`;
const REJECTS_KT = `    @Test
    fun rejectsNegative() = assertFailsWith<IllegalArgumentException> { Cart().discount(-1) }
`;
const kotlinClass = (...members) => `package demo\n\nclass CartTest {\n${members.join('\n')}}\n`;
const withKotlin = (...members) => ({ ...KOTLIN_MAIN, [KOTLIN_TEST]: kotlinClass(...members) });
const kotlinFixture = withKotlin(SUMS_KT, REJECTS_KT);

describe('Java deleted tests', () => {
  it('reports a removed method and a removed nested-class method with their keys', () => {
    expect(detect(javaFixture, withJava(SUMS))).toMatchObject([
      {
        kind: 'deleted-test',
        detail: 'test removed: CartTest.Discounts.rejectsNegative',
        path: JAVA_TEST,
      },
    ]);
    expect(detect(javaFixture, withJava(NESTED))).toMatchObject([
      { kind: 'deleted-test', detail: 'test removed: CartTest.sumsLines' },
    ]);
  });

  it('reports every test of a deleted test file', () => {
    expect(kinds(detect(javaFixture, JAVA_MAIN))).toEqual(['deleted-test', 'deleted-test']);
  });

  it('does not report a renamed method or a test moved to another class', () => {
    expect(detect(javaFixture, withJava(SUMS.replace('sumsLines', 'addsUpLines'), NESTED))).toEqual(
      [],
    );
    const moved = { ...JAVA_MAIN, 'src/test/java/demo/OtherTest.java': javaClass(SUMS, NESTED) };
    expect(detect(javaFixture, moved)).toEqual([]);
  });

  it('does not report added tests', () => {
    expect(detect(javaFixture, withJava(SUMS, NESTED, SUMS.replace('sumsLines', 'more')))).toEqual(
      [],
    );
  });
});

describe('Java skipped tests', () => {
  it.each([
    ['@Disabled', '  @Disabled\n  @Test\n  void sumsLines() {'],
    ['@Disabled with a reason after @Test', '  @Test\n  @Disabled("later")\n  void sumsLines() {'],
    ['@Ignore', '  @Ignore\n  @Test\n  void sumsLines() {'],
    ['@DisabledOnOs', '  @Test\n  @DisabledOnOs(OS.LINUX)\n  void sumsLines() {'],
  ])('reports %s', (_name, replacement) => {
    const skipped = SUMS.replace('  @Test\n  void sumsLines() {', replacement);
    expect(detect(javaFixture, withJava(skipped, NESTED))).toMatchObject([
      { kind: 'skipped-test', detail: 'test skipped: CartTest.sumsLines' },
    ]);
  });

  it('reports a false assumption and a disabled class', () => {
    const assumed = SUMS.replace('Cart cart', 'assumeTrue(false);\n    Cart cart');
    expect(kinds(detect(javaFixture, withJava(assumed, NESTED)))).toEqual(['skipped-test']);
    const disabledClass = javaClass(SUMS, NESTED).replace(
      'class CartTest',
      '@Disabled\nclass CartTest',
    );
    expect(kinds(detect(javaFixture, { ...JAVA_MAIN, [JAVA_TEST]: disabledClass }))).toEqual([
      'skipped-test',
      'skipped-test',
    ]);
  });

  it('reports a new test that is born disabled', () => {
    const born =
      '  @Test\n  @Disabled\n  void later() {\n    assertEquals(1, new Cart().add(1).total());\n  }\n';
    expect(detect(javaFixture, withJava(SUMS, NESTED, born))).toMatchObject([
      { kind: 'skipped-test', detail: 'new test is skipped: CartTest.later' },
    ]);
  });
});

describe('Java weaker assertions', () => {
  it('reports fewer assertions', () => {
    const final = withJava(SUMS.replace('    assertEquals(5, cart.add(5).total());\n', ''), NESTED);
    expect(detect(javaFixture, final)).toMatchObject([
      { kind: 'removed-assertion', detail: 'CartTest.sumsLines: assertions 2 -> 1' },
    ]);
  });

  it('counts assertThat, verify and assertAll', () => {
    const member = (body) => `  @Test\n  void a() {\n${body}  }\n`;
    const all =
      '    assertThat(x).isEqualTo(1);\n    verify(mock).call();\n    verifyNoMoreInteractions(mock);\n    assertAll(() -> {});\n';
    const fewer = all.replace('    verify(mock).call();\n', '');
    expect(detect(withJava(member(all)), withJava(member(fewer)))).toMatchObject([
      { detail: 'CartTest.a: assertions 4 -> 3' },
    ]);
  });

  it.each([
    ['assertTrue(true)', '    assertTrue(true);'],
    ['assertFalse(false)', '    assertFalse(false);'],
    ['assertEquals(x, x)', '    assertEquals(cart, cart);'],
    ['assert true', '    assert true;'],
  ])('reports the tautology %s', (_name, line) => {
    expect(detect(javaFixture, withJava(sumsWith(line), NESTED))).toMatchObject([
      { kind: 'always-passing-assertion', detail: expect.stringContaining('CartTest.sumsLines') },
    ]);
  });

  it('reports an equality assertion loosened to assertNotNull', () => {
    const final = withJava(sumsWith('    assertNotNull(cart.total());'), NESTED);
    expect(kinds(detect(javaFixture, final))).toEqual(['weakened-assertion']);
  });
});

describe('Java mocked subject', () => {
  it.each([
    ['mock(Cart.class)', '    Cart cart = mock(Cart.class);'],
    ['Mockito.spy(Cart.class)', '    Cart cart = Mockito.spy(Cart.class);'],
    ['mockStatic(Cart.class)', '    var held = mockStatic(Cart.class);'],
    ['@Mock Cart', '    @Mock Cart field;'],
  ])('reports %s in CartTest', (_name, line) => {
    const final = withJava(`${SUMS}\n${line}\n`, NESTED);
    expect(detect(javaFixture, final)).toMatchObject([{ kind: 'mocked-subject' }]);
  });

  it('allows mocking a collaborator', () => {
    const final = withJava(
      sumsWith('    Prices prices = mock(Prices.class);\n    assertEquals(0, 0);'),
      NESTED,
    );
    expect(kinds(detect(javaFixture, final))).not.toContain('mocked-subject');
  });
});

describe('Kotlin tests', () => {
  it('reports a removed test with a backquoted name and a removed expression-bodied test', () => {
    expect(detect(kotlinFixture, withKotlin(REJECTS_KT))).toMatchObject([
      { kind: 'deleted-test', detail: 'test removed: CartTest.sums lines' },
    ]);
    expect(detect(kotlinFixture, withKotlin(SUMS_KT))).toMatchObject([
      { kind: 'deleted-test', detail: 'test removed: CartTest.rejectsNegative' },
    ]);
  });

  it.each([['@Disabled'], ['@Ignore']])('reports %s', (annotation) => {
    const skipped = REJECTS_KT.replace('    @Test', `    ${annotation}\n    @Test`);
    expect(detect(kotlinFixture, withKotlin(SUMS_KT, skipped))).toMatchObject([
      { kind: 'skipped-test', detail: 'test skipped: CartTest.rejectsNegative' },
    ]);
  });

  it('counts assertFailsWith and Kotest matchers, and reports their removal', () => {
    const bare = REJECTS_KT.replace(/ = assertFailsWith.*/u, ' = Cart().discount(-1)');
    expect(detect(kotlinFixture, withKotlin(SUMS_KT, bare))).toMatchObject([
      { kind: 'removed-assertion', detail: 'CartTest.rejectsNegative: assertions 1 -> 0' },
    ]);
    const kotest =
      '    @Test\n    fun a() {\n        x shouldBe 1\n        y.shouldNotBeNull()\n    }\n';
    const weaker = kotest.replace('        x shouldBe 1\n', '');
    expect(detect(withKotlin(kotest), withKotlin(weaker))).toMatchObject([
      { kind: 'removed-assertion', detail: 'CartTest.a: assertions 2 -> 1' },
    ]);
  });

  it('reports a tautology and a mocked subject', () => {
    const final = withKotlin(
      SUMS_KT.replace(
        '        val cart = Cart()',
        '        val cart = mockk<Cart>()\n        assertTrue(true)',
      ),
      REJECTS_KT,
    );
    expect(kinds(detect(kotlinFixture, final)).sort()).toEqual([
      'always-passing-assertion',
      'mocked-subject',
    ]);
  });

  it('reports a loosened assertion', () => {
    const final = withKotlin(
      SUMS_KT.replace(
        '        assertEquals(0, cart.total())',
        '        assertNotNull(cart.total())',
      ),
      REJECTS_KT,
    );
    expect(kinds(detect(kotlinFixture, final))).toEqual(['weakened-assertion']);
  });
});
