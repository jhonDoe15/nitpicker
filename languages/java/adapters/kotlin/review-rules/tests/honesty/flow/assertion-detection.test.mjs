import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf } from '../../../test-support/sources.mjs';
import { CONTROL_FLOW_RULE } from './assertion-flow.mjs';

const flow = (text, names) => rulesOf(text, CONTROL_FLOW_RULE, undefined, names);
const inTest = (body, head = JUNIT_HEAD, helpers = '') => `${head}class OrderTest {
    @Test
    fun checks() {
${body}
    }
${helpers}
}
`;
const IN_LOOP = (call) => `        for (order in orders()) {\n            ${call}\n        }`;

describe('what counts as an assertion', () => {
  it('counts an imported function whose name starts with expect', () => {
    const head = `${JUNIT_HEAD}import demo.support.expectValid\n`;

    expect(flow(inTest(IN_LOOP('expectValid(order)'), head))).toEqual(['OrderTest.checks@13']);
  });

  it('does not count an expect function that is not imported', () => {
    expect(flow(inTest(IN_LOOP('expectValid(order)')))).toEqual([]);
  });

  it('counts an import alias of an assertion', () => {
    const head = `${JUNIT_HEAD}import org.junit.jupiter.api.Assertions.assertEquals as eq\n`;

    expect(flow(inTest(IN_LOOP('eq(1, order.size)'), head))).toEqual(['OrderTest.checks@13']);
  });

  it('counts an alias of an imported expect function and of an imported verify', () => {
    const head = `${JUNIT_HEAD}import demo.support.expectValid as valid\nimport io.mockk.verify as check\n`;

    expect(
      flow(inTest(`${IN_LOOP('valid(order)')}\n${IN_LOOP('check { mock.send(order) }')}`, head)),
    ).toEqual(['OrderTest.checks@14', 'OrderTest.checks@17']);
  });

  it('does not count an alias of a function that is not an assertion', () => {
    const head = `${JUNIT_HEAD}import demo.support.load as eq\n`;

    expect(flow(inTest(IN_LOOP('eq(order)'), head))).toEqual([]);
  });

  it('counts the names of the project assertion convention', () => {
    const body = IN_LOOP('checkOrder(order)');

    expect(flow(inTest(body), ['checkOrder'])).toEqual(['OrderTest.checks@12']);
    expect(flow(inTest(body))).toEqual([]);
  });

  it('counts an expect function from a star import of a project package, not a declaration', () => {
    const head = `${JUNIT_HEAD}import demo.support.*\n`;
    const declared = inTest('        fun expectLocal(x: Int) = x\n        expectLocal(1)', head);

    expect(flow(inTest(IN_LOOP('expectValid(order)'), head))).toEqual(['OrderTest.checks@13']);
    expect(flow(declared)).toEqual([]);
  });

  it('does not count an expect function of a standard library star import', () => {
    const head = `${JUNIT_HEAD}import kotlin.collections.*\n`;

    expect(flow(inTest(IN_LOOP('expectValid(order)'), head))).toEqual([]);
  });

  it('counts convention names only for undotted and this calls', () => {
    const dotted = flow(inTest(IN_LOOP('checks.checkOrder(order)')), ['checkOrder']);

    expect(dotted).toEqual([]);
    expect(flow(inTest(IN_LOOP('this.checkOrder(order)')), ['checkOrder'])).toEqual([
      'OrderTest.checks@12',
    ]);
  });

  it('does not count matcher builders or stubbing', () => {
    const head = `${JUNIT_HEAD}import io.mockk.every\nimport io.mockk.match\nimport io.mockk.verify\n`;
    const body = IN_LOOP('every { mailer.send(match { it.id > 0 }) } returns Unit');

    expect(flow(inTest(body, head))).toEqual([]);
    expect(
      flow(inTest(IN_LOOP('every { mailer.send(argThat { it.id > 0 }) } returns Unit'), head)),
    ).toEqual([]);
  });
});

describe('a branch that calls an asserting helper of the same file', () => {
  const helper = `    private fun checkSize(size: Int) {\n        assertEquals(1, size)\n    }`;

  it('is reported like a branch that asserts', () => {
    const body = `        if (ready()) {\n            checkSize(1)\n        }\n        when (kind()) {\n            "a" -> checkSize(2)\n            else -> println("b")\n        }`;

    expect(flow(inTest(body, JUNIT_HEAD, helper))).toEqual([
      'OrderTest.checks@12',
      'OrderTest.checks@15',
    ]);
  });

  it('allows an if and else whose every branch asserts through helpers', () => {
    const body = `        if (ready()) {\n            checkSize(1)\n        } else {\n            checkSize(2)\n        }`;

    expect(flow(inTest(body, JUNIT_HEAD, helper))).toEqual([]);
  });

  it('allows a branch that calls a helper which does not assert', () => {
    const quiet = `    private fun load() {\n        println("x")\n    }`;
    const body = `        if (ready()) {\n            load()\n        }\n        assertEquals(1, 1)`;

    expect(flow(inTest(body, JUNIT_HEAD, quiet))).toEqual([]);
  });
});
