import { describe, expect, it } from 'vitest';
import { eslintMessageWithHint } from './eslint-hints.mjs';

const IMMUTABLE = (kind) =>
  `${kind} should have an immutability of at least "ReadonlyDeep" (actual: "Mutable").`;
const REJECT = 'Expected the Promise rejection reason to be an Error.';

describe('eslintMessageWithHint', () => {
  it.each(['Variable', 'Parameter', 'Return type', 'Property'])(
    'replaces the immutability jargon of a %s with two sentences when nothing more is known',
    (kind) => {
      const message = eslintMessageWithHint({
        ruleId: 'functional/prefer-immutable-types',
        text: IMMUTABLE(kind),
        relativePath: 'src/main/features/a/domain/x.ts',
      });

      expect(message).toBe(
        `${kind} is mutable; domain/ values must be deeply readonly. Type it deeply readonly, e.g. \`readonly T[]\` or \`{ readonly field: T }\`.`,
      );
    },
  );

  it('leaves an immutability message it does not know as the rule wrote it', () => {
    const text = 'Something else about immutability.';

    expect(
      eslintMessageWithHint({
        ruleId: 'functional/prefer-immutable-types',
        text,
        relativePath: 'src/main/a.ts',
      }),
    ).toBe(text);
  });

  it('names the allowed non-Error rejection in test files only', () => {
    const inTest = eslintMessageWithHint({
      ruleId: '@typescript-eslint/prefer-promise-reject-errors',
      text: REJECT,
      relativePath: 'test/prices.test.ts',
    });
    const inSource = eslintMessageWithHint({
      ruleId: '@typescript-eslint/prefer-promise-reject-errors',
      text: REJECT,
      relativePath: 'src/main/prices.ts',
    });

    expect(inTest).toBe(
      `${REJECT} In tests, reject with \`vi.fn().mockRejectedValue(value)\` to use a non-Error reason.`,
    );
    expect(inSource).toBe(REJECT);
  });

  it.each([
    '@typescript-eslint/no-unsafe-member-access',
    '@typescript-eslint/no-unsafe-argument',
    '@typescript-eslint/no-unsafe-assignment',
    '@typescript-eslint/no-unsafe-call',
    '@typescript-eslint/no-unsafe-return',
  ])('names the reader-function fix for %s', (ruleId) => {
    const text = 'Unsafe member access .id on an `any` value.';

    expect(eslintMessageWithHint({ ruleId, text, relativePath: 'src/main/a.ts' })).toBe(
      `${text} Read fields of a legacy \`any\` value through one reader function whose parameter is \`unknown\` and that returns a typed object.`,
    );
  });

  it('does not touch other rules', () => {
    expect(
      eslintMessageWithHint({
        ruleId: 'no-debugger',
        text: 'Unexpected debugger.',
        relativePath: 'a.ts',
      }),
    ).toBe('Unexpected debugger.');
  });
});
