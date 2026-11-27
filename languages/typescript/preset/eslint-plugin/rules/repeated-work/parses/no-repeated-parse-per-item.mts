import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { openRepeat, readsMemo, type Repeat } from '../support/loop-invariance.mts';
import { localFunction, parserVerdict } from './pure-parsers.mts';

const SHARED_FIELDS = new Set([
  'category',
  'code',
  'kind',
  'message',
  'rule',
  'ruleId',
  'tool',
  'type',
]);

function isLoopLocal(sourceCode: SourceCode, node: TSESTree.Identifier, repeat: Repeat): boolean {
  const definition = variableNamed(sourceCode, node)?.defs[0];
  return definition !== undefined && contains(repeat.node, definition.name);
}

function sharedField(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  repeat: Repeat,
): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.computed ||
    node.object.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const name = memberName(node);
  return name !== undefined &&
    SHARED_FIELDS.has(name) &&
    isLoopLocal(sourceCode, node.object, repeat)
    ? name
    : undefined;
}

function parseStep(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): { readonly parses: boolean; readonly argument: TSESTree.CallExpressionArgument } | undefined {
  const fn = localFunction(sourceCode, call.callee);
  const [argument] = call.arguments;
  const verdict =
    fn === undefined || argument === undefined || call.arguments.length !== 1
      ? undefined
      : parserVerdict(sourceCode, fn);
  return verdict?.pure === true && argument !== undefined
    ? { parses: verdict.parses, argument }
    : undefined;
}

function parseChain(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): { readonly parses: boolean; readonly input: TSESTree.Node } | undefined {
  const pending: TSESTree.CallExpression[] = [call];
  const steps: { readonly parses: boolean; readonly argument: TSESTree.Node }[] = [];
  for (const current of pending) {
    const step = parseStep(sourceCode, current);
    if (step === undefined) {
      return undefined;
    }
    steps.push(step);
    if (step.argument.type === AST_NODE_TYPES.CallExpression) {
      pending.push(step.argument);
    }
  }
  const last = steps.at(-1);
  return last === undefined
    ? undefined
    : { parses: steps.some((step) => step.parses), input: last.argument };
}

function parsedField(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  repeat: Repeat,
): string | undefined {
  const chain = parseChain(sourceCode, call);
  return chain?.parses === true ? sharedField(sourceCode, chain.input, repeat) : undefined;
}

function isOutermost(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  return (
    parent.type !== AST_NODE_TYPES.CallExpression ||
    parent.arguments[0] !== call ||
    parseChain(sourceCode, parent) === undefined
  );
}

export const rule: TSESLint.RuleModule<'parsePerItem'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow parsing the same text field again for every item of a list instead of once per value',
    },
    schema: [],
    messages: {
      parsePerItem:
        '`{{call}}` parses the `{{field}}` of every item again, although items usually share a handful of values of `{{field}}`, and each item keeps its own copy of the result. Parse each distinct value once and share the result: keep a `Map` from the value to its parse for the length of the loop.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        const repeat = openRepeat(call);
        if (repeat === undefined || !isOutermost(sourceCode, call)) {
          return;
        }
        const field = parsedField(sourceCode, call, repeat);
        const input = call.arguments[0];
        const memo =
          input !== undefined &&
          readsMemo(repeat.node, (key) => sourceCode.getText(key) === sourceCode.getText(input));
        if (field !== undefined && !memo) {
          context.report({
            node: call,
            messageId: 'parsePerItem',
            data: { call: sourceCode.getText(call.callee), field },
          });
        }
      },
    };
  },
};
