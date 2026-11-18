import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { plainName } from '../encoding/plain-names.mts';
import { decodedSource, type DecodedSource } from './decoded-sources.mts';

type MessageId = 'decoder' | 'file';

const WRITES = new Set(['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync']);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const PASS_THROUGH = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TemplateLiteral,
]);

function uses(context: Context, call: TSESTree.CallExpression): TSESTree.Node[] {
  let top: TSESTree.Node = call;
  while (top.parent !== undefined && PASS_THROUGH.has(top.parent.type)) {
    top = top.parent;
  }
  const declarator = top.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init !== top) {
    return [call];
  }
  if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return [];
  }
  const variable = findVariable(context, declarator.id, declarator.id.name);
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  return writes.length === 1
    ? (variable?.references.filter((reference) => reference.isRead()) ?? []).map(
        (reference) => reference.identifier,
      )
    : [];
}

type Flow = { readonly context: Context; readonly source: DecodedSource };

function isSinkCall(flow: Flow, call: TSESTree.CallExpression, carried: TSESTree.Node): boolean {
  const { context, source } = flow;
  const name = plainName(call.callee) ?? '';
  const callee = unwrapped(call.callee);
  if (source.kind === 'file') {
    return (
      WRITES.has(name) &&
      call.arguments[1] === carried &&
      call.arguments[0] !== undefined &&
      context.sourceCode.getText(call.arguments[0]) === source.path
    );
  }
  if (WRITES.has(name)) {
    return call.arguments[1] === carried;
  }
  const owner = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  if (name === 'parse') {
    return owner !== undefined && context.sourceCode.getText(owner) === 'JSON';
  }
  return (
    name === 'update' && owner !== undefined && /hash/iu.test(context.sourceCode.getText(owner))
  );
}

function isConstantSide(context: Context, node: TSESTree.Node): boolean {
  return stringValue(resolveConstant(context, node)) !== undefined;
}

function carryThrough(parent: TSESTree.Node, current: TSESTree.Node): TSESTree.Node | undefined {
  if (
    PASS_THROUGH.has(parent.type) ||
    (parent.type === AST_NODE_TYPES.BinaryExpression && parent.operator === '+')
  ) {
    return parent;
  }
  const isMethodReceiver =
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === current &&
    parent.parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.parent.callee === parent;
  return isMethodReceiver ? parent.parent : undefined;
}

function sinkOutcome(
  flow: Flow,
  parent: TSESTree.Node,
  current: TSESTree.Node,
): boolean | 'continue' {
  if (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.includes(current as never)
  ) {
    if (isSinkCall(flow, parent, current)) {
      return true;
    }
    return flow.source.kind === 'file' ? 'continue' : false;
  }
  if (parent.type === AST_NODE_TYPES.BinaryExpression && EQUALITY.has(parent.operator)) {
    const other = parent.left === current ? parent.right : parent.left;
    return flow.source.kind === 'decoder' && !isConstantSide(flow.context, other);
  }
  return false;
}

function reachesSink(flow: Flow, start: TSESTree.Node): boolean {
  let current = start;
  for (let parent = current.parent; parent !== undefined; parent = current.parent) {
    const carried = carryThrough(parent, current);
    const outcome = carried === undefined ? sinkOutcome(flow, parent, current) : 'continue';
    if (outcome !== 'continue') {
      return outcome;
    }
    current = carried ?? parent;
  }
  return false;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow decoding bytes to text with silent replacement where the text is parsed, compared or written back',
    },
    schema: [],
    messages: {
      decoder:
        '`new TextDecoder()` without `fatal: true` replaces invalid UTF-8 with U+FFFD, so this text is parsed, ' +
        "compared or written from corrupted data with no error. Use `new TextDecoder('utf-8', { fatal: true })`.",
      file:
        'This file is read as `utf8` and written back to the same path, so invalid UTF-8 becomes U+FFFD and ' +
        "bytes are lost. Decode the `Buffer` with `new TextDecoder('utf-8', { fatal: true })`.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const source = decodedSource(context, node);
        if (
          source !== undefined &&
          uses(context, node).some((use) => reachesSink({ context, source }, use))
        ) {
          context.report({ node, messageId: source.kind });
        }
      },
    };
  },
};
