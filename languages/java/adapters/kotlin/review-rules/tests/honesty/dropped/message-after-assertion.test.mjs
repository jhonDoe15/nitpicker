import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf } from '../../../test-support/sources.mjs';
import { MESSAGE_RULE } from './message-after-assertion.mjs';

const messages = (text) => rulesOf(text, MESSAGE_RULE);
const HEAD = `${JUNIT_HEAD}import org.assertj.core.api.Assertions.assertThat\n`;
const inTest = (body, head = HEAD) => `${head}class NameTest {
    @Test
    fun checks() {
${body}
    }
}
`;

describe('an AssertJ message set after the assertion', () => {
  it.each([
    ['withFailMessage', '        assertThat(name()).hasSize(3).withFailMessage("length")'],
    ['a backticked as', '        assertThat(name()).isEqualTo("ADA").`as`("name")'],
    [
      'describedAs after a longer chain',
      '        assertThat(name()).isNotNull().isUpperCase().describedAs("case")',
    ],
    [
      'overridingErrorMessage',
      '        assertThat(name()).startsWith("A").overridingErrorMessage("start")',
    ],
  ])('reports %s', (_label, body) => {
    expect(messages(inTest(body))).toHaveLength(1);
  });

  it.each([
    [
      'a message before the assertion',
      '        assertThat(name()).withFailMessage("length").hasSize(3)',
    ],
    [
      'a description that later assertions follow',
      '        assertThat(name()).hasSize(3).`as`("name").isNotEmpty()',
    ],
    [
      'a description before an assertion',
      '        assertThat(name()).`as`("name").isEqualTo("ADA")',
    ],
    [
      'a description after a conversion',
      '        assertThat(name()).extracting { it.length }.`as`("length").isEqualTo(3)',
    ],
  ])('allows %s', (_label, body) => {
    expect(messages(inTest(body))).toEqual([]);
  });

  it('ignores a file that does not use AssertJ', () => {
    const body = '        assertThat(name()).hasSize(3).withFailMessage("length")';

    expect(messages(inTest(body, JUNIT_HEAD))).toEqual([]);
  });
});
