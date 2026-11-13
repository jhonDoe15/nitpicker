import { containsNode } from '../support/nodes.mjs';
import { hasCommentIn, replacing } from '../support/ranges.mjs';
import { isDeclared } from '../support/scope.mjs';

const DECLARATIONS = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration']);
const ESCAPES = new Set([
  'ReturnStatement',
  'BreakStatement',
  'ContinueStatement',
  'YieldExpression',
]);

function unpausedSubject(sourceCode, statement) {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AwaitExpression') {
    return undefined;
  }
  const call = statement.expression.argument;
  const callee = call.type === 'CallExpression' ? call.callee : undefined;
  const isUnpause =
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === 'unpause' &&
    call.arguments.length === 0;
  return isUnpause ? sourceCode.getText(callee.object) : undefined;
}

function movesOut(sourceCode, statement) {
  return (
    DECLARATIONS.has(statement.type) ||
    containsNode(sourceCode, statement, {
      matches: (node) =>
        ESCAPES.has(node.type) || (node.type === 'Identifier' && node.name === 'arguments'),
      intoFunctions: false,
    })
  );
}

function pausedWork(sourceCode, call) {
  const statement = call.parent.parent;
  const block = statement?.parent;
  const inBlock = ['BlockStatement', 'Program'].includes(block?.type);
  const isAwaited =
    call.parent.type === 'AwaitExpression' && statement.type === 'ExpressionStatement';
  if (!(isAwaited && inBlock)) {
    return undefined;
  }
  const subject = sourceCode.getText(call.callee.object);
  const index = block.body.indexOf(statement);
  const last = block.body.findIndex(
    (candidate, position) => position > index && unpausedSubject(sourceCode, candidate) === subject,
  );
  const between = last === -1 ? [] : block.body.slice(index + 1, last);
  const isMovable = between.length > 0 && !between.some((item) => movesOut(sourceCode, item));
  return isMovable
    ? { subject, between, range: [statement.range[0], block.body[last].range[1]] }
    : undefined;
}

function workText(sourceCode, between) {
  const start = between[0].range[0];
  const lineStart = sourceCode.text.lastIndexOf('\n', start - 1) + 1;
  const isIndented = /^[ \t]*$/u.test(sourceCode.text.slice(lineStart, start));
  return sourceCode.text.slice(isIndented ? lineStart : start, between.at(-1).range[1]);
}

export function pauseFix(sourceCode, call) {
  const paused = pausedWork(sourceCode, call);
  if (paused === undefined || !isDeclared(sourceCode, call, 'withPausedContainer')) {
    return undefined;
  }
  if (hasCommentIn(sourceCode, paused.range)) {
    return undefined;
  }
  const work = workText(sourceCode, paused.between);
  return replacing(
    paused.range,
    `await withPausedContainer(${paused.subject}, async () => {\n${work}\n});`,
  );
}
