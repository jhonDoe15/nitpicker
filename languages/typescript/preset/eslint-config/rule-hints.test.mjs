import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { withHint } from './rule-hints.mjs';

const hint = ' Add an exception.';

const namedMessageRule = {
  meta: { type: 'problem', schema: [], messages: { bad: 'Bad {{name}}.' } },
  create: (context) => ({
    Identifier(node) {
      context.report({ node, messageId: 'bad', data: { name: node.name } });
    },
  }),
};

const plainMessageRule = {
  meta: { type: 'problem', schema: [] },
  create: (context) => ({
    Program(node) {
      context.report({ node, message: `Plain text of ${context.sourceCode.getText().trim()}.` });
    },
  }),
};

function ruleReporting(text) {
  return {
    meta: { type: 'problem', schema: [], messages: { byId: text } },
    create: (context) => ({
      Program(node) {
        context.report({ node, messageId: 'byId' });
        context.report({ node, message: text });
      },
    }),
  };
}

const optionsRule = {
  meta: { type: 'problem', schema: [{ type: 'string' }], messages: { seen: 'Option {{value}}.' } },
  create: (context) => ({
    Program(node) {
      context.report({ node, messageId: 'seen', data: { value: String(context.options[0]) } });
    },
  }),
};

function messagesOf(rule, code, options = []) {
  const linter = new Linter();
  const config = [
    {
      plugins: { demo: { rules: { rule } } },
      rules: { 'demo/rule': ['error', ...options] },
    },
  ];
  return linter.verify(code, config).map((message) => message.message);
}

describe('withHint', () => {
  it('appends the hint to messages that are reported by id, after filling in their data', () => {
    expect(messagesOf(withHint(namedMessageRule, hint), 'foo;')).toEqual([`Bad foo.${hint}`]);
  });

  it('appends the hint to messages that are reported as text', () => {
    expect(messagesOf(withHint(plainMessageRule, hint), 'foo;')).toEqual([
      `Plain text of foo;.${hint}`,
    ]);
  });

  it.each([
    [
      'no closing punctuation',
      'Cannot access refs during render',
      'Cannot access refs during render.',
    ],
    ['a closing period', 'Cannot access refs during render.', 'Cannot access refs during render.'],
    ['a question mark', 'Is this a ref?', 'Is this a ref?'],
    ['trailing space', 'Cannot access refs during render ', 'Cannot access refs during render.'],
  ])('ends a message with %s as one sentence before the hint', (_name, text, sentence) => {
    expect(messagesOf(withHint(ruleReporting(text), hint), 'foo;')).toEqual([
      `${sentence}${hint}`,
      `${sentence}${hint}`,
    ]);
  });

  it('leaves the message as it is when the hint starts with its own separator', () => {
    const separated = '. Await it.';

    expect(
      messagesOf(withHint(ruleReporting('Promise must be handled'), separated), 'foo;'),
    ).toEqual([`Promise must be handled${separated}`, `Promise must be handled${separated}`]);
  });

  it('leaves the rule untouched', () => {
    expect(messagesOf(namedMessageRule, 'foo;')).toEqual(['Bad foo.']);
    expect(messagesOf(plainMessageRule, 'foo;')).toEqual(['Plain text of foo;.']);
  });

  it('keeps the rule metadata and passes options through', () => {
    const wrapped = withHint(optionsRule, hint);

    expect(wrapped.meta.type).toBe('problem');
    expect(wrapped.meta.schema).toEqual(optionsRule.meta.schema);
    expect(messagesOf(wrapped, 'foo;', ['strict'])).toEqual([`Option strict.${hint}`]);
  });

  it('gives a rule without declared messages an empty message table', () => {
    expect(withHint(plainMessageRule, hint).meta.messages).toEqual({});
  });
});
