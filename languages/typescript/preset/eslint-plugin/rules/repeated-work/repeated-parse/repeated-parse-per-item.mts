import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { outerOf } from '../../collections/costly-forms/repeated-runs.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { isTestFile } from '../materialize/unbounded-source.mts';
import { isCachedInLoop, parsedFieldName } from './field-access.mts';
import { enclosingItemLoop } from './loop-context.mts';
import { localFunctionFor } from './parse-constants.mts';
import { isDirectParseCall, isPureTextParser } from './pure-parser.mts';

function isParseCall(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  if (isDirectParseCall(sourceCode, call)) {
    return true;
  }
  const localFn = localFunctionFor(sourceCode, call.callee);
  return localFn !== undefined && isPureTextParser(sourceCode, localFn);
}

function isInsideOuterParse(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const outer = outerOf(call);
  const { parent } = outer;
  if (parent?.type === AST_NODE_TYPES.CallExpression && isParseCall(sourceCode, parent)) {
    return true;
  }
  if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === outer) {
    const outerCall = outerOf(parent).parent;
    return outerCall?.type === AST_NODE_TYPES.CallExpression && isParseCall(sourceCode, outerCall);
  }
  return false;
}

export const rule: TSESLint.RuleModule<'repeatedParsePerItem'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow repeatedly parsing the same repeating item field inside a loop without caching',
    },
    schema: [],
    messages: {
      repeatedParsePerItem:
        'Repeatedly parsing `{{field}}` on every item re-runs the same text parsing for duplicate values. Cache the parsed result by the `{{field}}` value for the duration of the loop.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        if (!isParseCall(sourceCode, call) || isInsideOuterParse(sourceCode, call)) {
          return;
        }
        const loop = enclosingItemLoop(sourceCode, call);
        if (loop === undefined) {
          return;
        }
        const field = parsedFieldName(sourceCode, call, loop);
        if (field !== undefined && !isCachedInLoop(sourceCode, loop, field)) {
          context.report({
            node: call,
            messageId: 'repeatedParsePerItem',
            data: { field },
          });
        }
      },
    };
  },
};
