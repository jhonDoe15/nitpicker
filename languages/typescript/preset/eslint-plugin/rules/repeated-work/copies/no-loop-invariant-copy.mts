import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { memberName, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { invariantIn, openRepeat } from '../support/loop-invariance.mts';
import { copiedSource, isPlainSource, isStored } from './copy-forms.mts';

const MUTATORS = new Set([
  'add',
  'clear',
  'copyWithin',
  'delete',
  'fill',
  'pop',
  'push',
  'reverse',
  'set',
  'shift',
  'sort',
  'splice',
  'unshift',
]);
const LITERALS = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.TemplateLiteral,
]);

function isLiteralSource(sourceCode: SourceCode, source: TSESTree.Node): boolean {
  if (source.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = variableNamed(sourceCode, source)?.defs[0];
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : null;
  return init !== null && LITERALS.has(init.type);
}

function mutatedInside(
  sourceCode: SourceCode,
  source: TSESTree.Node,
  repeat: TSESTree.Node,
): boolean {
  const text = sourceCode.getText(source);
  return someNode(repeat, (node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    const { callee } = node;
    return (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      MUTATORS.has(memberName(callee) ?? '') &&
      sourceCode.getText(callee.object) === text
    );
  });
}

export const rule: TSESLint.RuleModule<'copyPerPass'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow storing a full copy of a value that does not change in a loop on every pass of it',
    },
    schema: [],
    messages: {
      copyPerPass:
        '`{{copy}}` stores a new full copy of `{{source}}` on every pass of this loop or callback, although `{{source}}` does not change in it, so memory grows with the number of passes times its size. Share one read-only value (a `readonly` array, one copy made before the loop) instead. The cost only matters when both the loop and `{{source}}` can be large.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function check(node: TSESTree.Node): void {
      const source = copiedSource(node);
      const repeat = openRepeat(node);
      if (
        source === undefined ||
        repeat === undefined ||
        !isPlainSource(source) ||
        isLiteralSource(sourceCode, source) ||
        !invariantIn(sourceCode, source, repeat.node) ||
        mutatedInside(sourceCode, source, repeat.node) ||
        !isStored(node, repeat.node)
      ) {
        return;
      }
      context.report({
        node,
        messageId: 'copyPerPass',
        data: { copy: sourceCode.getText(node), source: sourceCode.getText(source) },
      });
    }
    return {
      ArrayExpression: check,
      ObjectExpression: check,
      NewExpression: check,
      CallExpression: check,
    };
  },
};
