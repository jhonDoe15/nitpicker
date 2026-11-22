import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import {
  extractSerializedParts,
  isCallNamed,
  isJsonCall,
  isUnboundedList,
  matchesListName,
  readSourceCallOf,
} from './unbounded-list-analysis.mts';

type MessageIds = 'unboundedJsonList';
type Context = Readonly<TSESLint.RuleContext<MessageIds, []>>;

const WRITE_SINKS = new Set(['write', 'writeFileSync', 'writeFile', 'writeSync', 'appendFileSync']);

function isUnboundedSerialization(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const expr = unwrapped(node);
  if (expr.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (isJsonCall(expr, 'stringify')) {
    const target = expr.arguments[0];
    return target !== undefined && isUnboundedList(sourceCode, target);
  }
  const callee = unwrapped(expr.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(callee) === 'join' &&
    isUnboundedList(sourceCode, callee.object)
  );
}

function readTargetMatchesList(readCall: TSESTree.CallExpression): boolean {
  const first = readCall.arguments[0];
  if (first === undefined) {
    return false;
  }
  const literal = stringValue(first);
  if (literal !== undefined) {
    return matchesListName(literal);
  }
  const expr = unwrapped(first);
  return expr.type === AST_NODE_TYPES.Identifier && matchesListName(expr.name);
}

function bindingMatchesList(node: TSESTree.CallExpression): boolean {
  const parent = node.parent;
  if (parent.type !== AST_NODE_TYPES.VariableDeclarator || parent.init !== node) {
    return false;
  }
  if (parent.id.type === AST_NODE_TYPES.Identifier) {
    return matchesListName(parent.id.name);
  }
  if (parent.id.type === AST_NODE_TYPES.ObjectPattern) {
    return parent.id.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        property.key.type === AST_NODE_TYPES.Identifier &&
        matchesListName(property.key.name),
    );
  }
  return false;
}

function checkWriteSink(context: Context, node: TSESTree.CallExpression): void {
  const badPart = node.arguments
    .flatMap((argument) => extractSerializedParts(context.sourceCode, argument))
    .find((part) => isUnboundedSerialization(context.sourceCode, part));
  if (badPart !== undefined) {
    context.report({ node, messageId: 'unboundedJsonList' });
  }
}

function checkJsonParseRead(context: Context, node: TSESTree.CallExpression): void {
  const readCall = readSourceCallOf(context.sourceCode, node.arguments[0]);
  if (readCall === undefined) {
    return;
  }
  if (readTargetMatchesList(readCall) || bindingMatchesList(node)) {
    context.report({ node, messageId: 'unboundedJsonList' });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid serializing or parsing an unbounded list as one large JSON or joined string',
    },
    schema: [],
    messages: {
      unboundedJsonList:
        'Avoid serializing or parsing an unbounded list as one large string. Write the list one element per line (NDJSON or batches) and read it line by line instead.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (isCallNamed(node, WRITE_SINKS)) {
          checkWriteSink(context, node);
          return;
        }
        if (isJsonCall(node, 'parse')) {
          checkJsonParseRead(context, node);
        }
      },
    };
  },
};
