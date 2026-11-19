import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const COPY_PASTED_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['copy-pasted-tests'],
    describe: (subject: string): string => {
      const [name, count] = subject.split(':');
      return `Test \`${String(name)}\` repeats the body of ${String(count)} others and differs only in its literals`;
    },
    allowed:
      'Put the cases in one table: `@pytest.mark.parametrize("price, total", [(10, 12), (20, 24)])` over one test function, or a loop of `with self.subTest(price=price):` in a `unittest.TestCase`. A test whose copies differ in a call is not a copy.',
  },
];
