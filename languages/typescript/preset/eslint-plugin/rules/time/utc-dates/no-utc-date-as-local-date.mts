import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { dateUseOf, type Use } from './date-uses.mts';

const USE_TEXT: Readonly<Record<Use, string>> = {
  state: 'the first value of component or form state',
  input: 'a value of a date input',
  fallback: 'the default for a date that was not given',
};
import { isUtcToday } from './utc-date-texts.mts';

function heldIn(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const holder = node.parent;
  if (holder?.type !== AST_NODE_TYPES.VariableDeclarator || holder.init !== node) {
    return undefined;
  }
  return holder.id.type === AST_NODE_TYPES.Identifier ? holder.id : undefined;
}

function usesOfVariable(code: TSESLint.SourceCode, name: TSESTree.Identifier): Use[] {
  const variable = code
    .getDeclaredVariables(name.parent)
    .find((declared) => declared.name === name.name);
  return (variable?.references ?? [])
    .filter((reference) => reference.identifier !== name)
    .flatMap((reference) => dateUseOf(reference.identifier) ?? []);
}

export const rule: TSESLint.RuleModule<'utcDate'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report the UTC date cut out of toISOString() where it is used as the calendar date of the user',
    },
    schema: [],
    messages: {
      utcDate:
        '`toISOString()` is in UTC, so this is the calendar date in UTC, used here as {{use}}: for part of every day it is yesterday or tomorrow for the person who reads or enters the date (already tomorrow in the evening in the Americas, still yesterday in the morning in Asia). Format the date in their time zone instead: `new Intl.DateTimeFormat("en-CA").format(new Date())` gives the local `YYYY-MM-DD` in a browser or command line tool (pass `timeZone` on a server), or use `format(new Date(), "yyyy-MM-dd")` of the date library in use. An exception fits only when the day is meant to change at midnight UTC.',
    },
  },
  create(context) {
    function report(node: TSESTree.Node): void {
      if (!isUtcToday(context.sourceCode, node)) {
        return;
      }
      const held = heldIn(node);
      const use =
        held === undefined ? dateUseOf(node) : usesOfVariable(context.sourceCode, held)[0];
      if (use !== undefined) {
        context.report({ node, messageId: 'utcDate', data: { use: USE_TEXT[use] } });
      }
    }
    return { CallExpression: report, MemberExpression: report };
  },
};
