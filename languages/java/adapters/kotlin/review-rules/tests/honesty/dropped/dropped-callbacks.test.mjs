import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf } from '../../../test-support/sources.mjs';
import { DROPPED_RULE } from './dropped-callbacks.mjs';

const dropped = (text) => rulesOf(text, DROPPED_RULE);
const HELPERS = `    private fun hasLength(size: Int): (String) -> Unit = { assertEquals(size, it.length) }
    private fun isUpper(): Consumer<String> = Consumer { name -> assertEquals(name.uppercase(), name) }
    private fun run(check: (String) -> Unit) = check("ADA")
`;
const inTest = (body, helpers = HELPERS) => `${JUNIT_HEAD}import java.util.function.Consumer

class NameTest {
${helpers}
    @Test
    fun checks() {
${body}
    }
}
`;

describe('a callback that a statement builds and drops', () => {
  it.each([
    ['a bare call statement', '        hasLength(3)\n        assertEquals(1, 1)'],
    ['a Consumer result', '        isUpper()\n        assertEquals(1, 1)'],
    ['a call through this', '        this.hasLength(3)\n        assertEquals(1, 1)'],
    ['a lambda that only builds it', '        run { hasLength(3) }'],
    ['a lambda with a parameter', '        run { name -> hasLength(3) }'],
    ['a multi-line lambda', '        run { name ->\n            hasLength(3)\n        }'],
    ['an if body', '        if (flag()) {\n            hasLength(3)\n        }'],
  ])('reports %s', (_label, body) => {
    expect(dropped(inTest(body))).toHaveLength(1);
  });

  it('reports a function interface declared in the file', () => {
    const helpers = `    fun interface Check { fun on(name: String) }
    private fun lengthCheck(): Check = Check { name -> assertEquals(3, name.length) }
`;

    expect(
      dropped(inTest('        lengthCheck()\n        assertEquals(1, 1)', helpers)),
    ).toHaveLength(1);
  });

  it('reports a dropped callback in a Kotest body', () => {
    const text = `${KOTEST_HEAD}class NameSpec : FunSpec({
    fun hasLength(length: Int): (String) -> Unit = { name -> name.length shouldBe length }
    test("checks") {
        hasLength(3)
    }
})
`;

    expect(dropped(text)).toHaveLength(1);
  });

  it.each([
    ['a call that runs the callback', '        hasLength(3)("ADA")'],
    ['a call passed on', '        run(hasLength(3))'],
    ['a call that invokes it', '        hasLength(3).invoke("ADA")'],
    ['a stored callback', '        val check = hasLength(3)\n        check("ADA")'],
    ['a returned chain', '        isUpper().accept("ADA")'],
    ['a call that is not a callback', '        assertEquals(1, 1)'],
    ['a run whose value is kept', '        val f = run { hasLength(3) }\n        f("ADA")'],
    [
      'a when whose value is kept',
      '        val r = when (kind()) {\n            1 -> hasLength(1)\n            else -> hasLength(2)\n        }\n        r("ADA")',
    ],
    ['a callback returned from a let', '        val x = 1.let { hasLength(it) }'],
  ])('allows %s', (_label, body) => {
    expect(dropped(inTest(body))).toEqual([]);
  });
});
