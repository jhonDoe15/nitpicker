import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../eslint/normalize.mjs';
import {
  eslintMessageWithHint,
  growthAdviceFor,
  routedEslintMessage,
  withoutFatalDirectives,
} from './eslint-hints.mjs';

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

  describe('type-aware unsafe rules', () => {
    const RULES = [
      '@typescript-eslint/no-unsafe-member-access',
      '@typescript-eslint/no-unsafe-argument',
      '@typescript-eslint/no-unsafe-assignment',
      '@typescript-eslint/no-unsafe-call',
      '@typescript-eslint/no-unsafe-return',
    ];
    const ANY_TEXT = 'Unsafe member access .id on an `any` value.';
    const FIX_FIRST = 'fix any TypeScript error on the line first';

    it.each(RULES)('names the reader function and where it lives for %s', (ruleId) => {
      expect(eslintMessageWithHint({ ruleId, text: ANY_TEXT, relativePath: 'src/main/a.ts' })).toBe(
        `${ANY_TEXT} If the value is a legacy \`any\`, read it through one reader function whose parameter is \`unknown\` and that returns a typed object, kept in adapters/; ${FIX_FIRST}.`,
      );
    });

    it.each(RULES)('says how domain code reads a legacy any for %s', (ruleId) => {
      expect(
        eslintMessageWithHint({
          ruleId,
          text: ANY_TEXT,
          relativePath: 'src/main/features/billing/domain/split.ts',
        }),
      ).toBe(
        `${ANY_TEXT} If the value is a legacy \`any\`, domain/ cannot take \`unknown\`: have adapters/ parse it into a typed object and pass that in, or type the legacy parameter; ${FIX_FIRST}.`,
      );
    });

    it.each(RULES)('points at asymmetric matchers in test files for %s', (ruleId) => {
      expect(
        eslintMessageWithHint({
          ruleId,
          text: 'Unsafe assignment of an `any` value.',
          relativePath: 'test/notifications.test.ts',
        }),
      ).toBe(
        `Unsafe assignment of an \`any\` value. In tests the \`any\` usually comes from an asymmetric matcher (\`expect.any\`, \`expect.stringContaining\`, \`expect.objectContaining\`): assert the whole value with \`toEqual\`, and ${FIX_FIRST}.`,
      );
    });

    it.each([
      'Unsafe return of a value of type error.',
      'Unsafe assignment of an error typed value.',
      'Unsafe argument of type error typed assigned to a parameter of type `number`.',
      'Unsafe member access .stdout on a type that cannot be resolved.',
      'Unsafe call of a type that could not be resolved.',
    ])('sends an unresolved type to the TypeScript error first: %s', (text) => {
      const hinted = ['src/main/features/a/domain/x.ts', 'test/x.test.ts'].map((relativePath) =>
        eslintMessageWithHint({
          ruleId: '@typescript-eslint/no-unsafe-return',
          text,
          relativePath,
        }),
      );

      expect(hinted).toEqual([
        `${text} The type is unresolved because of a TypeScript error, often a failed import: fix that error first.`,
        `${text} The type is unresolved because of a TypeScript error, often a failed import: fix that error first.`,
      ]);
    });
  });

  describe('@typescript-eslint/only-throw-error', () => {
    const UPSTREAM = 'Expected an error object to be thrown.';
    const ruleId = '@typescript-eslint/only-throw-error';

    it('names the unknown-typed throw for test doubles in test files', () => {
      expect(
        eslintMessageWithHint({ ruleId, text: UPSTREAM, relativePath: 'test/uploads.test.ts' }),
      ).toBe(
        'Throw an Error subclass. A test double that must throw a non-Error value types it `unknown`: `const value: unknown = 7; throw value;`.',
      );
    });

    it('only asks for an Error subclass in production code', () => {
      expect(
        eslintMessageWithHint({
          ruleId,
          text: UPSTREAM,
          relativePath: 'src/main/features/a/adapters/x.ts',
        }),
      ).toBe('Throw an Error subclass.');
    });

    it('leaves the throw-undefined message as the rule wrote it', () => {
      expect(
        eslintMessageWithHint({
          ruleId,
          text: 'Do not throw undefined.',
          relativePath: 'test/a.test.ts',
        }),
      ).toBe('Do not throw undefined.');
    });
  });

  describe('vitest/expect-expect', () => {
    it('says the expect call belongs in the test body', () => {
      expect(
        eslintMessageWithHint({
          ruleId: 'vitest/expect-expect',
          text: 'Test has no assertions',
          relativePath: 'test/report.test.ts',
        }),
      ).toBe(
        'Test has no assertions. Call `expect` in the test body: asserting helpers do not count, so return the value and `expect` it in the test.',
      );
    });

    it('leaves another message from the rule as it was', () => {
      expect(
        eslintMessageWithHint({
          ruleId: 'vitest/expect-expect',
          text: 'Something else',
          relativePath: 'test/report.test.ts',
        }),
      ).toBe('Something else');
    });
  });

  it('tells a collapsed union to use the type the feature exports', () => {
    expect(
      eslintMessageWithHint({
        ruleId: '@typescript-eslint/no-duplicate-type-constituents',
        text: 'Union type constituent is duplicated with ReturnType<typeof orderReceipt>.',
        relativePath: 'src/main/composition-root.ts',
      }),
    ).toBe(
      'Union type constituent is duplicated with ReturnType<typeof orderReceipt>. The members are now the same type: use the one type the feature exports (e.g. `import type { Message }`), not a `ReturnType<...>` alias.',
    );
  });

  it('tells a void type argument to use undefined', () => {
    expect(
      eslintMessageWithHint({
        ruleId: '@typescript-eslint/no-invalid-void-type',
        text: 'void is only valid as a return type or generic type argument.',
        relativePath: 'test/support/fake-upload-deps.ts',
      }),
    ).toBe(
      'void is only valid as a return type or generic type argument. Use `undefined` instead of `void` here: `Promise.withResolvers<undefined>()` and `resolve(undefined)`.',
    );
  });

  describe('@typescript-eslint/switch-exhaustiveness-check', () => {
    const ruleId = '@typescript-eslint/switch-exhaustiveness-check';

    it('suggests an exhaustive helper in case the function is over a size limit', () => {
      expect(
        eslintMessageWithHint({
          ruleId,
          text: 'Switch is not exhaustive. Cases not matched: "on-hold"',
          relativePath: 'src/main/features/shipping/domain/summary.ts',
        }),
      ).toBe(
        'Switch is not exhaustive. Cases not matched: "on-hold". If this function is already over a size limit, adding cases will fail the size check: extract an exhaustive helper instead (e.g. a `Record<Union, number>` lookup).',
      );
    });

    it('leaves a message about the default case as it was', () => {
      const text = 'The switch statement is exhaustive, so the default case is unnecessary.';

      expect(eslintMessageWithHint({ ruleId, text, relativePath: 'src/main/a.ts' })).toBe(text);
    });
  });

  it('offers growth advice for nitpicker/no-throw only', () => {
    expect(growthAdviceFor('nitpicker/no-throw')).toBe(
      'This function had {base} of these at base and the count may not grow: a throw on a new line counts as new even when the count holds, so edit an existing throw line in place to throw a reason a new helper returns, or return a union from a new helper function.',
    );
    expect(growthAdviceFor('no-debugger')).toBeUndefined();
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

describe('routedEslintMessage', () => {
  const route = (rule) =>
    `If a reviewer agrees this is intended, add {"rule":"${rule}","paths":["src/a.ts"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.`;

  it('ends the message of any rule with the entry that turns it off for the path', () => {
    expect(
      routedEslintMessage({
        ruleId: '@typescript-eslint/no-explicit-any',
        text: 'Unexpected any.',
        relativePath: 'src/a.ts',
      }),
    ).toBe(`Unexpected any. ${route('@typescript-eslint/no-explicit-any')}`);
  });

  it('ends the hint of a rule it rewrites with the entry', () => {
    expect(
      routedEslintMessage({
        ruleId: 'vitest/expect-expect',
        text: 'Test has no assertions',
        relativePath: 'src/a.ts',
      }),
    ).toBe(
      `Test has no assertions. Call \`expect\` in the test body: asserting helpers do not count, so return the value and \`expect\` it in the test. ${route('vitest/expect-expect')}`,
    );
  });

  it('names no entry for a directive eslint reports without a rule', () => {
    expect(
      routedEslintMessage({
        ruleId: 'eslint/unused-disable-directive',
        text: 'Unused eslint-disable directive',
        relativePath: 'src/a.ts',
      }),
    ).toBe('Unused eslint-disable directive');
  });
});

describe('withoutFatalDirectives', () => {
  const directive = {
    fatal: true,
    message: '/* eslint-env */ comments are no longer supported.',
    severity: 2,
  };
  const rule = { ruleId: 'no-debugger', message: 'Unexpected debugger.', severity: 2 };

  it('drops the fatal eslint-env message and keeps everything else', () => {
    const otherFatal = { fatal: true, message: 'Parsing error: Unexpected token', severity: 2 };
    expect(withoutFatalDirectives([directive, rule, otherFatal])).toEqual([rule, otherFatal]);
  });

  it('lets a file with an eslint-env comment normalize without a crash', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-env-'));
    try {
      mkdirSync(path.join(root, 'src'), { recursive: true });
      writeFileSync(path.join(root, 'src/env.ts'), '/* eslint-env node */\nexport const a = 1;\n');
      const findings = normalizeEslintResults({
        value: [{ filePath: path.join(root, 'src/env.ts'), messages: [directive] }],
        projectRoot: root,
        analyzerName: 'eslint-errors',
      });
      expect(findings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('hints for the production policy rules', () => {
  const hint = (ruleId, text) => eslintMessageWithHint({ ruleId, text, relativePath: 'src/a.ts' });

  it('names the awaited form instead of the rule wording that recommends .catch', () => {
    const message = hint(
      '@typescript-eslint/no-floating-promises',
      'Promises must be awaited, end with a call to .catch, or end with a call to .then with a rejection handler.',
    );

    expect(message).toBe(
      `Await this promise: \`await job()\`, or \`await Promise.all([...])\` for several; \`.then()\` and \`.catch()\` do not count. Deliberate fire-and-forget is written \`void job();\`.`,
    );
  });

  it('keeps the rule wording of other floating-promise messages', () => {
    expect(
      hint('@typescript-eslint/no-floating-promises', 'An array of Promises may be unintentional.'),
    ).toBe('An array of Promises may be unintentional.');
  });

  it.each([
    [
      'Missing return type on function.',
      'Write the return type of an exported function: `export function total(rows: readonly Row[]): number`, `export async function load(): Promise<Report>`; a React component returns `ReactElement`.',
    ],
    [
      "Argument 'rows' should be typed.",
      "Argument 'rows' should be typed. Write the parameter type in the signature: `(rows: readonly Row[])`.",
    ],
    [
      'Missing return type on function',
      'Write the return type of an exported function: `export function total(rows: readonly Row[]): number`, `export async function load(): Promise<Report>`; a React component returns `ReactElement`.',
    ],
    [
      'Missing argument type on function',
      'Missing argument type on function. Write the parameter type in the signature: `(rows: readonly Row[])`.',
    ],
  ])('names the typed signature for a module boundary finding: %s', (text, expected) => {
    expect(hint('@typescript-eslint/explicit-module-boundary-types', text)).toBe(expected);
  });

  it('names the allowed casing for a naming-convention finding', () => {
    expect(hint('nitpicker/naming-convention', 'Function name `a_b` must match camelCase')).toBe(
      `Function name \`a_b\` must match camelCase. Types are PascalCase; functions, variables and parameters are camelCase; constants may be UPPER_CASE; a schema constant may be PascalCase (\`const Order = z.object(...)\`).  An exception fits only when an external API forces the name.`,
    );
  });

  it.each([
    ['no-eval', 'eval can be harmful.', 'look it up in a table keyed by name'],
    ['no-param-reassign', "Assignment to function parameter 'n'.", 'Declare a new const'],
    ['no-duplicate-imports', "'a' import is duplicated.", 'single import statement'],
    [
      'regexp/no-super-linear-backtracking',
      'Unsafe quantifier.',
      'without nested or overlapping quantifiers',
    ],
  ])('rewrites %s', (ruleId, text, expected) => {
    expect(hint(ruleId, text)).toContain(expected);
  });

  it.each([
    [
      'curly',
      "Expected { after 'if' condition.",
      "Expected { after 'if' condition. Wrap the body in braces: `if (done) { return; }`.",
    ],
    [
      'no-param-reassign',
      "Assignment to function parameter 'n'.",
      "Assignment to function parameter 'n'. Declare a new const with another name instead of reassigning the parameter. An exception fits only when the reassignment is deliberate.",
    ],
  ])('names the allowed form for %s', (ruleId, text, expected) => {
    expect(hint(ruleId, text)).toBe(expected);
  });
});
