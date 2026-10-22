import ts from 'typescript';
import { chainOf } from '../../../../../shared/traversal.mjs';
import { scriptKind } from '../../eslint/syntax.mjs';

const REDUCE_METHODS = new Set(['reduce', 'reduceRight']);
const SPREAD_KINDS = new Set([ts.SyntaxKind.SpreadElement, ts.SyntaxKind.SpreadAssignment]);
const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);

function accumulatingSpreadMessageId({ message, help = '' }) {
  if (message.includes('in loops')) {
    return help.includes('Object.assign') ? 'loopObject' : 'loopArray';
  }
  if (help.includes('spreading an `Object`')) return 'reduceObject';
  return help.includes('spreading an `Array`') ? 'reduceArray' : 'reduce';
}

function isReduceMessage(messageId) {
  return messageId.startsWith('reduce');
}

export const OWNED_NATIVE_RULES = new Map([
  [
    'nitpicker/no-accumulating-spread',
    {
      native: 'oxc/no-accumulating-spread',
      messageIdOf: accumulatingSpreadMessageId,
      needsDirectReducer: isReduceMessage,
    },
  ],
]);

export const OWNED_NATIVE_PLUGINS = [
  ...new Set([...OWNED_NATIVE_RULES.values()].map(({ native }) => native.split('/')[0])),
];

export function ownedNativeName(ruleId) {
  return OWNED_NATIVE_RULES.get(ruleId)?.native;
}

export function ownedNativeMessage({ ruleId, diagnostic, ruleMessages }) {
  const owned = OWNED_NATIVE_RULES.get(ruleId);
  if (owned === undefined) return undefined;
  const messageId = owned.messageIdOf(diagnostic);
  const message = ruleMessages[ruleId]?.[messageId];
  if (message === undefined) {
    throw new Error(`${ruleId} has no message ${messageId} for oxlint's ${diagnostic.code}`);
  }
  return { messageId, message, needsDirectReducer: owned.needsDirectReducer(messageId) };
}

function nodesAt(sourceFile, position) {
  return chainOf(sourceFile, (node) =>
    ts.forEachChild(node, (child) =>
      child.getStart(sourceFile) <= position && position < child.end ? child : undefined,
    ),
  );
}

function outermostParenthesized(node) {
  return chainOf(node, (current) =>
    ts.isParenthesizedExpression(current.parent) ? current.parent : undefined,
  ).at(-1);
}

function calledMethodName(callee) {
  const expression = ts.skipParentheses(callee);
  if (ts.isPropertyAccessExpression(expression)) {
    return ts.isIdentifier(expression.name) ? expression.name.text : undefined;
  }
  return ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
    ? expression.argumentExpression.text
    : undefined;
}

function isDirectReducer(fn) {
  const argument = outermostParenthesized(fn);
  const call = argument.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments[0] === argument &&
    call.arguments.length <= 2 &&
    REDUCE_METHODS.has(calledMethodName(call.expression))
  );
}

export function directReducerCheck(filePath, text) {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  return ({ line, column }) => {
    const position = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
    const spread = nodesAt(sourceFile, position)
      .filter((node) => SPREAD_KINDS.has(node.kind) && node.getStart(sourceFile) === position)
      .at(-1);
    const fn = chainOf(spread?.parent, (node) => node.parent).find((node) =>
      FUNCTION_KINDS.has(node.kind),
    );
    return fn !== undefined && isDirectReducer(fn);
  };
}
