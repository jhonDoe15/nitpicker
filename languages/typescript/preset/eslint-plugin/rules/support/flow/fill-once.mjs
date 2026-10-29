import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { childrenOf, contains } from '../../loops/loop-shapes.mjs';

const SETTERS = new Set(['set', 'add', 'setItem', 'put']);
const READERS = new Set(['has', 'get', 'getItem']);
const FILLS = new Set(['??=', '||=']);
const MEMBER = 'MemberExpression';
const IDENTIFIER = 'Identifier';

function nodesIn(root, visitorKeys) {
  const pending = [root];
  for (const node of pending) {
    pending.push(...childrenOf(node, visitorKeys));
  }
  return pending;
}

function readKey(node, sourceCode) {
  const { parent } = node;
  if (parent.type === MEMBER && parent.object === node) {
    const isReader = parent.parent.type === 'CallExpression' && parent.parent.callee === parent;
    return isReader && READERS.has(parent.property.name) ? sourceCode.getText(node) : undefined;
  }
  const isChain = node.type === MEMBER || node.type === IDENTIFIER;
  const isProperty = parent.type === MEMBER && parent.property === node;
  return isChain && !isProperty ? sourceCode.getText(node) : undefined;
}

function readKeys(test, sourceCode) {
  return nodesIn(test, sourceCode.visitorKeys)
    .map((node) => readKey(node, sourceCode))
    .filter((key) => key !== undefined);
}

function writtenKey(node, sourceCode) {
  if (node.type === 'AssignmentExpression') {
    return sourceCode.getText(node.left);
  }
  const callee = node.type === 'CallExpression' ? node.callee : undefined;
  return callee?.type === MEMBER && SETTERS.has(callee.property.name)
    ? sourceCode.getText(callee.object)
    : undefined;
}

function exits(statement) {
  const last = statement.type === 'BlockStatement' ? statement.body.at(-1) : statement;
  return last?.type === 'ReturnStatement' || last?.type === 'ThrowStatement';
}

function earlyReturns(call, root) {
  return ancestorsOf(call)
    .filter((ancestor) => ancestor.type === 'BlockStatement' && contains(root, ancestor))
    .flatMap((block) =>
      block.body.filter(
        (statement) =>
          statement.type === 'IfStatement' &&
          statement.range[1] <= call.range[0] &&
          exits(statement.consequent),
      ),
    );
}

function guards(call, root) {
  const enclosing = ancestorsOf(call).filter(
    (ancestor) =>
      ancestor.type === 'IfStatement' && contains(root, ancestor) && !contains(ancestor.test, call),
  );
  return [...enclosing, ...earlyReturns(call, root)];
}

export function isFillOnce(call, root, sourceCode) {
  const filled = ancestorsOf(call).some(
    (ancestor) => ancestor.type === 'AssignmentExpression' && FILLS.has(ancestor.operator),
  );
  if (filled) {
    return true;
  }
  const written = new Set(
    nodesIn(root, sourceCode.visitorKeys)
      .map((node) => writtenKey(node, sourceCode))
      .filter((key) => key !== undefined),
  );
  return guards(call, root).some((guard) =>
    readKeys(guard.test, sourceCode).some((key) => written.has(key)),
  );
}
