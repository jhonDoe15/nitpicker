import { Linter } from 'eslint';
import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { guardedEntry } from './guarded-plugins.mts';
import { demoted, keptFix, unfixed, type Guard } from './guard-types.mts';

type Messages = 'shout';

const shout: TSESLint.RuleModule<Messages> = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { shout: 'Write {{ name }} in capitals.' },
  },
  defaultOptions: [],
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
  const entries = [
    { files: ['**/*.js'], plugins: { demo: original } },
    { files: ['**/*.js'], plugins: { demo: original }, rules: { 'demo/shout': 'error' } },
  ].map((entry) => guardedEntry(entry, TABLE));
  const linter = new Linter({ configType: 'flat' });
  const fixed = linter.verifyAndFix(text, entries, { filename: 'a.js' });
  const messages = linter.verify(text, entries, { filename: 'a.js' });
  return {
    output: fixed.output,
    suggestions: messages.map(({ suggestions }) => suggestions?.length ?? 0),
  };
}

describe('guarded upstream fixes', () => {
  it('keeps the fix the guard keeps', () => {
    expect(lint('kept;\n')).toEqual({ output: 'KEPT;\n', suggestions: [0] });
  });

  it('moves the fix the guard demotes to a single suggestion', () => {
    expect(lint('demoted;\n')).toEqual({ output: 'demoted;\n', suggestions: [1] });
  });

  it('drops the fix the guard drops and keeps the report', () => {
    expect(lint('removed;\n')).toEqual({ output: 'removed;\n', suggestions: [0] });
  });

  it('gives every entry the same guarded copy of a plugin', () => {
    const original = plugin();
    const [first, second] = [{ plugins: { demo: original } }, { plugins: { demo: original } }].map(
      (entry) => guardedEntry(entry, TABLE),
    );
    expect(
      [first?.['plugins'], second?.['plugins']].map((plugins) =>
        Reflect.get(Object(plugins), 'demo'),
      ),
    ).toEqual([
      Reflect.get(Object(second?.['plugins']), 'demo'),
      Reflect.get(Object(first?.['plugins']), 'demo'),
    ]);
    expect(Reflect.get(Object(first?.['plugins']), 'demo')).not.toBe(original);
  });

  it('leaves the plugins of other namespaces and entries without plugins alone', () => {
    const other = plugin();
    expect(guardedEntry({ plugins: { other } }, TABLE)).toEqual({ plugins: { other } });
    expect(guardedEntry({ rules: {} }, TABLE)).toEqual({ rules: {} });
  });
});
