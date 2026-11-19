import { describe, expect, it } from 'vitest';
import { RULES_TOOL } from '../../rule-hints.mts';
import { describeRuleFinding, exceptionRoute, withHint } from '../../typed/rule-hint-views.mts';

describe('forwarded parameter rule messages', () => {
  it.each([
    [
      'partial: Parser.parse > super().parse',
      "`Parser.parse` takes `partial` but calls `super().parse` without it, so the caller's `partial` is silently ignored by the base method",
    ],
    [
      'verbose: load > read',
      "`load` takes `verbose` but calls `read` without it, although `read` has a `verbose` parameter, so the caller's setting is dropped",
    ],
    [
      'region_name: MyTrigger.serialize',
      '`MyTrigger.serialize` leaves `region_name` out of the arguments it returns, so the object rebuilt from them runs without it',
    ],
  ])('describe %s', (subject, description) => {
    expect(describeRuleFinding('parameter-not-forwarded', subject)).toBe(description);
  });

  it('names the allowed form and ends with the exception route', () => {
    const { message } = withHint({
      tool: RULES_TOOL,
      rule: 'parameter-not-forwarded',
      path: 'src/mod.py',
      message: 'Subject.',
      classification: 'enforceable',
    });

    expect(message).toBe(
      `Subject. Pass the parameter on (\`super().parse_result(result, partial=partial)\`, a \`"region_name": self.region_name\` entry in \`serialize()\`), forward everything with \`*args, **kwargs\`, or drop the parameter from the signature when the override deliberately narrows the base method. ${exceptionRoute({ rule: 'parameter-not-forwarded', path: 'src/mod.py', key: 'python.exceptions' })}`,
    );
  });
});
