import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { splitCallOf, constantText, type SplitCall } from '../text-splits/split-calls.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { isFunctionNode } from '../analysis/constant-resolution.mts';

const SEPARATORS = new Set([':', '=']);
const CLOCK_NAME = /^(?:h|m|s|hh|mm|ss|hours?|minutes?|mins?|seconds?|secs?|hrs?)$/iu;
const CLOCK_SOURCE = /time|clock|duration|hhmm|ratio|aspect/iu;
const SECOND_PART = 1;
const KEY_PREFIX = /([:=])["'`]$/u;

function patternName(element: TSESTree.Node | null): string | undefined {
  const target = element?.type === AST_NODE_TYPES.AssignmentPattern ? element.left : element;
  return target?.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
}

function isTruncatingPattern(pattern: TSESTree.ArrayPattern): boolean {
  const [first, second] = pattern.elements;
  return (
    pattern.elements.length === 2 &&
    first?.type !== AST_NODE_TYPES.RestElement &&
    second?.type !== AST_NODE_TYPES.RestElement &&
    ![first, second].some((element) => CLOCK_NAME.test(patternName(element ?? null) ?? ''))
  );
}

const EQUALITY = new Set(['===', '!==', '==', '!=']);

function isComparedToText(node: TSESTree.MemberExpression): boolean {
  const { parent } = node;
  if (parent?.type !== AST_NODE_TYPES.BinaryExpression || !EQUALITY.has(parent.operator)) {
    return false;
  }
  const other = parent.left === node ? parent.right : parent.left;
  return other.type === AST_NODE_TYPES.Literal && typeof other.value === 'string';
}

function scopeOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

type KeyedPrefix = {
  readonly text: string;
  readonly scope: TSESTree.Node | undefined;
  readonly separator: string;
};
type PairState = {
  readonly context: Readonly<TSESLint.RuleContext<'truncatedPair', []>>;
  readonly pending: SplitCall[];
  readonly keyed: KeyedPrefix[];
};

function queue(state: PairState, split: SplitCall | undefined): void {
  const { context } = state;
  const clocked =
    split !== undefined && CLOCK_SOURCE.test(context.sourceCode.getText(split.receiver));
  if (
    split !== undefined &&
    SEPARATORS.has(split.separator) &&
    constantText(context, split.receiver) === undefined &&
    !clocked
  ) {
    state.pending.push(split);
  }
}

function collectPrefix(state: PairState, node: TSESTree.CallExpression): void {
  const { callee } = node;
  const [first] = node.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    nameOf(callee.property) !== 'startsWith' ||
    first === undefined
  ) {
    return;
  }
  const { sourceCode } = state.context;
  const [, separator] = KEY_PREFIX.exec(sourceCode.getText(first)) ?? [];
  if (separator !== undefined) {
    state.keyed.push({ text: sourceCode.getText(callee.object), scope: scopeOf(node), separator });
  }
}

function reportPending(state: PairState): void {
  const { context, keyed, pending } = state;
  for (const split of pending) {
    const text = context.sourceCode.getText(split.receiver);
    const scope = scopeOf(split.call);
    const tied = keyed.some(
      (guard) =>
        guard.text === text && guard.scope === scope && guard.separator === split.separator,
    );
    if (!tied) {
      context.report({
        node: split.call,
        messageId: 'truncatedPair',
        data: { separator: split.separator },
      });
    }
  }
}

export const rule: TSESLint.RuleModule<'truncatedPair'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reading a key and a value from a split on ":" or "=" that drops the text after the second separator',
    },
    schema: [],
    messages: {
      truncatedPair:
        'This reads two parts of a split on `{{separator}}`, so a value that contains `{{separator}}` (a ' +
        'URL, a message, a base64 `=`) loses everything after its second one. Cut at the first separator: ' +
        '`const i = text.indexOf("{{separator}}")` then `text.slice(0, i)` and `text.slice(i + 1)`, or `const ' +
        '[key, ...rest] = text.split("{{separator}}")` with `rest.join("{{separator}}")`. A limit does not ' +
        'help in JavaScript, `split(sep, 2)` also drops the rest. A format that cannot hold the separator ' +
        'twice takes an exception.',
    },
  },
  create(context) {
    const state: PairState = { context, pending: [], keyed: [] };

    return {
      CallExpression: (node: TSESTree.CallExpression) => collectPrefix(state, node),
      'Program:exit': () => reportPending(state),
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init &&
          isTruncatingPattern(node.id)
        ) {
          queue(state, splitCallOf(context, node.init));
        }
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (node.left.type === AST_NODE_TYPES.ArrayPattern && isTruncatingPattern(node.left)) {
          queue(state, splitCallOf(context, node.right));
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        if (
          node.computed &&
          node.property.type === AST_NODE_TYPES.Literal &&
          node.property.value === SECOND_PART &&
          !isComparedToText(node)
        ) {
          queue(state, splitCallOf(context, node.object));
        }
      },
    };
  },
};
