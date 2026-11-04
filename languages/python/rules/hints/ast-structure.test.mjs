import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { withHint } from '../rule-hints.mjs';

const route = (rule) => exceptionRoute({ rule, path: 'src/a.py', key: 'python.exceptions' });

const sample = ({ tool, rule }) => ({
  tool,
  rule,
  path: 'src/a.py',
  identity: 'x',
  message: 'The base message.',
  classification: 'enforceable',
});

describe('type laundering messages', () => {
  const cast = (subject, libraries) =>
    withHint(
      { ...sample({ tool: 'python-rules', rule: 'type-cast' }), subject, message: 'x' },
      libraries,
    ).message;

  it('names the parse at the boundary only for a container target', () => {
    expect(cast('cast(str) in convert')).toBe(
      `x. Narrow the value with \`isinstance\` or \`match\`, or give it the correct type at its source. ${route('type-cast')}`,
    );
    expect(cast('cast(dict[str, int])')).toBe(
      `x. Narrow the value with \`isinstance\` or \`match\`, or give it the correct type at its source. Parse untrusted input once in \`adapters/\` with pydantic (\`Model.model_validate(data)\`). ${route('type-cast')}`,
    );
  });

  it('keeps the allowed form of an explicit Any to one sentence', () => {
    const { message } = withHint({
      ...sample({ tool: 'python-rules', rule: 'explicit-any' }),
      subject: 'f(a)',
    });

    expect(message).toBe(
      `The base message. Write the concrete type, a \`Protocol\`, a \`TypeVar\`, a \`ParamSpec\` or \`object\` (\`dict[str, object]\`, \`Callable[..., object]\`). ${route('explicit-any')}`,
    );
  });
});
