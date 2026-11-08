import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf } from '../../test-support/sources.mjs';
import { FLOAT_EQUALITY_RULE } from './float-equality.mjs';

const floats = (text) => rulesOf(text, FLOAT_EQUALITY_RULE);
const inTest = (...lines) =>
  `${JUNIT_HEAD}class MathTest {\n    @Test\n    fun adds() {\n${lines.map((line) => `        ${line}`).join('\n')}\n    }\n}\n`;
const reportedLines = (...lines) => floats(inTest(...lines)).map((entry) => entry.split('@')[1]);

describe('float equality in a JUnit or kotlin.test body', () => {
  it('reports a fractional literal as expected or actual, negated or in exponent form', () => {
    expect(
      floats(
        inTest(
          'assertEquals(0.1, total)',
          'assertEquals(total, -0.1)',
          'assertEquals(0.1f, ratio)',
          'assertEquals(1e-3, total)',
          'assertNotEquals(0.25, total)',
          'assertEquals(1_000.5, total)',
          'assertEquals(+0.5, total)',
          'assertEquals<Double>(0.1, total)',
          'assertEquals(expected = 0.1, actual = total)',
        ),
      ),
    ).toEqual(Array.from({ length: 9 }, (_, index) => `MathTest.adds@${String(12 + index)}`));
  });

  it('reports a message and a Supplier overload, a message first and the qualified holders', () => {
    expect(
      reportedLines(
        'assertEquals(0.1, total, "total")',
        'assertEquals(0.1, total, message = "total")',
        'assertEquals(0.1, total) { "total" }',
        'assertEquals(0.1, total, { "total" })',
        'assertEquals("total", 0.1, total)',
        'Assertions.assertEquals(0.1, total)',
        'org.junit.Assert.assertNotEquals(0.1, total)',
        'kotlin.test.assertEquals(0.1, total)',
      ),
    ).toEqual(['12', '13', '14', '15', '16', '17', '18', '19']);
  });

  it('allows a tolerance, a delta and the integral literals', () => {
    expect(
      floats(
        inTest(
          'assertEquals(0.1, total, absoluteTolerance = 1e-9)',
          'assertEquals(0.1, total, absoluteTolerance = 1e-9, message = "total")',
          'assertEquals(0.1, total, 1e-9)',
          'assertEquals(0.1, total, DELTA)',
          'assertEquals("total", 0.1, total, 1e-9)',
          'assertNotEquals(0.1, total, 1e-9)',
          'assertEquals(1.0, total)',
          'assertEquals(2e3, total)',
          'assertEquals(3.0f, total)',
          'assertEquals(3, total.toInt())',
          'assertEquals(0.1 + 0.2, total)',
          'assertEquals(0.1.toBigDecimal(), total)',
          'assertEquals(0x1F, count)',
          'assertEquals(10L, count)',
          'assertEquals("0.1", text)',
          'assertEquals(listOf(0.1), values)',
          'assertTrue(total < 0.1)',
        ),
      ),
    ).toEqual([]);
  });

  it('ignores a literal in a string, a template or a comment', () => {
    expect(
      floats(
        inTest(
          'assertEquals("0.1", text)',
          'assertEquals("""0.1""", text)',
          '// assertEquals(0.1, total)',
          '/* assertEquals(0.1, total) */',
          'val note = "assertEquals(0.1, total)"',
          'assertEquals(name, "v${0.1}")',
        ),
      ),
    ).toEqual([]);
  });

  it('counts a helper function in a test class and reports it under its own name', () => {
    const text = `${JUNIT_HEAD}class MathTest {
    private fun check(total: Double) {
        assertEquals(0.3, total)
    }

    @Test
    fun adds() { check(0.3) }
}
`;

    expect(floats(text)).toEqual(['MathTest.check@11']);
  });
});

describe('float equality with AssertJ', () => {
  const head = `${JUNIT_HEAD}import org.assertj.core.api.Assertions.assertThat\n\n`;

  it('reports isEqualTo and isNotEqualTo with a fractional literal', () => {
    const text = `${head}class MathTest {
    @Test
    fun adds() {
        assertThat(total).isEqualTo(0.3)
        assertThat(total).isNotEqualTo(-0.3)
        assertThat(total).as("total").isEqualTo(0.3f)
    }
}
`;

    expect(floats(text)).toEqual(['MathTest.adds@14', 'MathTest.adds@15', 'MathTest.adds@16']);
  });

  it('allows isCloseTo, an offset, an integral literal and ordering', () => {
    const text = `${head}class MathTest {
    @Test
    fun adds() {
        assertThat(total).isCloseTo(0.3, within(1e-9))
        assertThat(total).isEqualTo(0.3, within(1e-9))
        assertThat(total).isEqualTo(1.0)
        assertThat(total).isGreaterThan(0.3)
        assertThat(name).isEqualTo("0.3")
    }
}
`;

    expect(floats(text)).toEqual([]);
  });

  it('needs AssertJ in the file', () => {
    expect(reportedLines('assertThat(total).isEqualTo(0.3)')).toEqual([]);
  });
});

describe('float equality with Kotest', () => {
  const spec = (...lines) =>
    `${KOTEST_HEAD}class MathSpec : FunSpec({\n    test("adds") {\n${lines.map((line) => `        ${line}`).join('\n')}\n    }\n})\n`;

  it('reports shouldBe and shouldNotBe against a fractional literal', () => {
    expect(
      floats(
        spec(
          'total shouldBe 0.3',
          'total shouldNotBe -0.3',
          'total shouldBe (0.3)',
          'total.shouldBe(0.3)',
          'total.shouldNotBe(0.3f)',
          'foo(total shouldBe 0.3)',
        ),
      ),
    ).toEqual(Array.from({ length: 6 }, (_, index) => `MathSpec > adds@${String(9 + index)}`));
  });

  it('allows plusOrMinus, an integral literal and a literal that is only part of a value', () => {
    expect(
      floats(
        spec(
          'total shouldBe (0.3 plusOrMinus 1e-9)',
          'total shouldBe 0.3.plusOrMinus(1e-9)',
          'total shouldBe 0.3 plusOrMinus 1e-9',
          'total shouldBe 1.0',
          'total shouldBe 2e3',
          'total shouldBe 0.3 + offset',
          'total shouldBe 0.3.toBigDecimal()',
          'total shouldBe "0.3"',
          'total shouldBeGreaterThan 0.3',
          'total.shouldBe(0.3 plusOrMinus 1e-9)',
          'total.shouldBe(1.0)',
        ),
      ),
    ).toEqual([]);
  });
});

describe('float equality inside a truth assertion', () => {
  it('reports an equality or inequality with a fractional literal in assertTrue and assertFalse', () => {
    expect(
      reportedLines(
        'assertTrue(total == 0.1)',
        'assertFalse(total != 0.1)',
        'assertTrue(0.1 == total)',
        'assertTrue(total == -0.1f, "total")',
        'assertTrue("total", total == 1e-3)',
        'assertTrue { total == 0.1 }',
        'assertTrue("total") { total == 0.1 }',
        'assertTrue(ready && total === 0.1)',
        'Assertions.assertFalse(total != 0.1)',
        'kotlin.test.assertTrue(total == 0.1)',
      ),
    ).toEqual(['12', '13', '14', '15', '16', '17', '18', '19', '20', '21']);
  });

  it('allows ordering, a tolerance check, integral literals and a literal in arithmetic', () => {
    expect(
      floats(
        inTest(
          'assertTrue(total < 0.1)',
          'assertTrue(total >= 0.1)',
          'assertTrue(abs(total - 0.1) < 1e-9)',
          'assertTrue(Math.abs(total - 0.1) <= tolerance)',
          'assertTrue(total == 1.0)',
          'assertFalse(total != 2e3)',
          'assertTrue(total == 0.1 + offset)',
          'assertTrue(name == "0.1")',
          'assertTrue(ready)',
          'assertTrue(total.isCloseTo(0.1))',
        ),
      ),
    ).toEqual([]);
  });

  it('reports the Kotest and AssertJ truth forms', () => {
    const text = `${JUNIT_HEAD}import org.assertj.core.api.Assertions.assertThat

class MathTest {
    @Test
    fun adds() {
        (total == 0.1) shouldBe true
        (total != 0.1) shouldNotBe false
        (total == 0.1).shouldBeTrue()
        assertThat(total == 0.1).isTrue()
        assertThat(total != 0.1).as("total").isFalse()
        assertThat(total < 0.1).isTrue()
        assertThat(abs(total - 0.1) < 1e-9).isTrue()
        (total < 0.1) shouldBe true
        assertThat(total == 1.0).isTrue()
    }
}
`;

    expect(floats(text)).toEqual(
      Array.from({ length: 5 }, (_, index) => `MathTest.adds@${String(14 + index)}`),
    );
  });

  it('needs AssertJ in the file for isTrue', () => {
    expect(reportedLines('assertThat(total == 0.1).isTrue()')).toEqual([]);
  });
});

describe('Kotlin float literal edge cases', () => {
  const spec = (...lines) =>
    `${KOTEST_HEAD}class MathSpec : FunSpec({\n    test("adds") {\n${lines.map((line) => `        ${line}`).join('\n')}\n    }\n})\n`;
  const specLines = (...lines) => floats(spec(...lines)).map((entry) => entry.split('@')[1]);

  it('does not report a parenthesised literal that is followed by more expression', () => {
    expect(
      specLines(
        'x shouldBe (0.5) * y',
        'x shouldBe (0.1).toBigDecimal()',
        'x shouldBe (2.5).pow(2)',
        'x shouldBe (0.5) + 1',
        'x shouldBe 0.5?.let { it }',
        'x shouldBe (0.5',
      ),
    ).toEqual([]);
  });

  it('reports a parenthesised literal that ends the expression', () => {
    expect(specLines('x shouldBe (0.5)', 'foo(x shouldBe (0.5))', 'x shouldBe -.5')).toEqual([
      '9',
      '10',
      '11',
    ]);
  });

  it('skips a literal whose expression continues on the next line', () => {
    expect(
      specLines(
        'x shouldBe 0.1\n            .plus(1)',
        'x shouldBe 0.1\n            ?.plus(1)',
        'x shouldBe 0.1\n            && ready',
        'x shouldBe 0.2',
        'x shouldBe 0.3\n        y shouldBe 1',
      ),
    ).toEqual(['15', '16']);
  });

  it('reports a literal without an integer part and ignores a member access', () => {
    expect(
      reportedLines(
        'assertEquals(.5, x)',
        'assertEquals(x, -.5f)',
        'assertTrue(x == .5)',
        'assertTrue(.5 != x)',
        'assertEquals(a.5, x)',
        'assertTrue(x.5 == y)',
      ),
    ).toEqual(['12', '13', '14', '15']);
    expect(specLines('x shouldBe .5', 'x shouldBe a.5')).toEqual(['9']);
  });

  it('allows AssertJ with a comparator in the chain', () => {
    const text = `${JUNIT_HEAD}import org.assertj.core.api.Assertions.assertThat

class MathTest {
    @Test
    fun adds() {
        assertThat(total).usingComparator(Double::compare).isEqualTo(0.5)
        assertThat(total).usingComparator(DoubleComparator(0.01)).as("total").isNotEqualTo(0.5)
        assertThat(total).usingDefaultComparator().isEqualTo(0.5)
        assertThat(total).isEqualTo(0.5)
    }
}
`;

    expect(floats(text)).toEqual(['MathTest.adds@17']);
  });

  it('scans a long run of spaces before shouldBe quickly', () => {
    const padded = spec(`x${' '.repeat(50_000)}shouldBe 0.5`);
    const started = performance.now();

    expect(floats(padded)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
