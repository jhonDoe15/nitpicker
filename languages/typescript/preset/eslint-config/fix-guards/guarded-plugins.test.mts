import { Linter } from 'eslint';
import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { guardedEntries } from './guarded-plugins.mts';
import { demoted, keptFix, unfixed, type Guard } from './guard-types.mts';

type Messages = 'shout';

const shout: TSESLint.RuleModule<Messages> = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { shout: 'Write {{ name }} in capitals.' },
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name !== node.name.toUpperCase()) {
          context.report({
            node,
            messageId: 'shout',
            data: { name: node.name },
            fix: (fixer) => fixer.replaceText(node, node.name.toUpperCase()),
          });
        }
      },
    };
  },
};

function plugin(): object {
  return { meta: { name: 'demo' }, rules: { shout } };
}

function byName(): Guard {
  return (descriptor, context) => {
    const text = context.sourceCode.getText().slice(0, 1);
    if (text === 'k') {
      return keptFix(descriptor);
    }
    return text === 'd' ? demoted(descriptor) : unfixed(descriptor);
  };
}

const TABLE = { demo: { shout: { status: 'automatic' as const, guard: byName() } } };

function lint(text: string, original = plugin()) {
  const entries = guardedEntries(
    [
      { files: ['**/*.js'], plugins: { demo: original } },
      {
        files: ['**/*.js'],
        plugins: { demo: original },
        rules: { 'demo/shout': 'error' as const },
      },
    ],
    TABLE,
  );
  const linter = new Linter({ configType: 'flat' });
  const fixed = linter.verifyAndFix(text, entries, { filename: 'a.js' });
  const messages = linter.verify(text, entries, { filename: 'a.js' });
  return {
    output: fixed.output,
    suggestions: messages.map(({ suggestions }) => suggestions?.length ?? 0),
  };
}

function demoOf(entry: Readonly<Record<string, unknown>> | undefined): unknown {
  const plugins: unknown = entry?.['plugins'];
  const demo: unknown = Reflect.get(Object(plugins), 'demo');
  return demo;
}

describe('guarded upstream fixes', () => {
  it.each([
    ['keeps the fix the guard keeps', 'kept;\n', 'KEPT;\n', 0],
    ['moves the fix the guard demotes to a single suggestion', 'demoted;\n', 'demoted;\n', 1],
    ['drops the fix the guard drops and keeps the report', 'removed;\n', 'removed;\n', 0],
  ])('%s', (_name, text, output, suggestions) => {
    expect(lint(text)).toEqual({ output, suggestions: [suggestions] });
  });

  it('gives every entry the same guarded copy of a plugin', () => {
    const original = plugin();
    const [first, second] = guardedEntries(
      [{ plugins: { demo: original } }, { plugins: { demo: original } }],
      TABLE,
    );
    const copy = demoOf(first);

    expect(demoOf(second)).toBe(copy);
    expect(copy).not.toBe(original);
  });

  it('leaves the plugins of other namespaces and entries without plugins alone', () => {
    const other = plugin();
    expect(guardedEntries([{ plugins: { other } }, { rules: {} }], TABLE)).toEqual([
      { plugins: { other } },
      { rules: {} },
    ]);
  });
});
