import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { outerOf } from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isRepeatedRelativeTo, isSinglePassConsumer } from './single-pass-consumer.mts';
import { isBoundedList, isTestFile, materializedSource } from './unbounded-source.mts';

function passedToSinglePass(
  sourceCode: SourceCode,
  identifier: TSESTree.Node,
  declarator: TSESTree.VariableDeclarator,
): boolean {
  const outer = outerOf(identifier);
  const call = outer.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const argIndex = call.arguments.findIndex((argument) => argument === outer);
  return (
    argIndex !== -1 &&
    !isRepeatedRelativeTo(identifier, declarator) &&
    isSinglePassConsumer(sourceCode, call, argIndex)
  );
}

export const rule: TSESLint.RuleModule<'materializeBeforeSinglePass'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow materializing an intermediate array before passing it to a single-pass consumer',
    },
    schema: [],
    messages: {
      materializeBeforeSinglePass:
        'This materializes an intermediate array before passing it to a single-pass consumer, holding all transformed items in memory at once. Use a generator that maps or filters each item as it is consumed instead.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        for (const [index, argument] of call.arguments.entries()) {
          if (argument.type === AST_NODE_TYPES.SpreadElement) {
            continue;
          }
          const source = materializedSource(argument);
          if (
            source !== undefined &&
            !isBoundedList(sourceCode, source) &&
            isSinglePassConsumer(sourceCode, call, index)
          ) {
            context.report({ node: argument, messageId: 'materializeBeforeSinglePass' });
          }
        }
      },
      VariableDeclarator(declarator) {
        const { id, init, parent } = declarator;
        if (id.type !== AST_NODE_TYPES.Identifier || init === null || parent.kind !== 'const') {
          return;
        }
        const source = materializedSource(init);
        if (source === undefined || isBoundedList(sourceCode, source)) {
          return;
        }
        const uses = (variableNamed(sourceCode, id)?.references ?? []).filter((ref) => !ref.init);
        const [only] = uses;
        if (
          uses.length === 1 &&
          only !== undefined &&
          passedToSinglePass(sourceCode, only.identifier, declarator)
        ) {
          context.report({ node: init, messageId: 'materializeBeforeSinglePass' });
        }
      },
    };
  },
};
