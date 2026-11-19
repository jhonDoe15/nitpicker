import { describe, expect, it } from 'vitest';
import { RULES_TOOL } from '../../rule-hints.mts';
import { describeRuleFinding, exceptionRoute, withHint } from '../../typed/rule-hint-views.mts';

describe('iterator rule messages', () => {
  it('names the iterator and the function that reads it twice', () => {
    expect(describeRuleFinding('iterator-read-twice', 'items (build)')).toBe(
      '`items` is a generator or iterator that is read more than once in `build`: the first read uses it up, so a later loop, membership test or forwarded call sees nothing',
    );
  });

  it('names the allowed form and ends with the exception route', () => {
    const { message } = withHint({
      tool: RULES_TOOL,
      rule: 'iterator-read-twice',
      path: 'src/mod.py',
      message: 'Subject.',
      classification: 'enforceable',
    });

    expect(message).toBe(
      `Subject. Materialize it once (\`items = list(items)\`, \`tuple(...)\`), or split it with \`itertools.tee\`; take a \`Collection\` or \`Sequence\` and convert at the boundary. In a Django \`save\` override, write \`update_fields = kwargs["update_fields"] = list(update_fields)\` before the first test. ${exceptionRoute({ rule: 'iterator-read-twice', path: 'src/mod.py', key: 'python.exceptions' })}`,
    );
  });
});
