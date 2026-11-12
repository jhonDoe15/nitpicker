import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { classDeclarationOf, isProjectDeclaration } from './nest-classes.mjs';

const MAX_DEPTH = 4;
const MAX_FUNCTIONS = 200;

function functionLabel(declaration) {
  const name = declaration.name?.getText() ?? 'anonymous function';
  const owner = ts.isClassLike(declaration.parent) ? declaration.parent.name?.text : undefined;
  return owner === undefined ? name : `${owner}.${name}`;
}

function calledFunction(checker, call) {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  const hasBody =
    declaration !== undefined &&
    !ts.isJSDocSignature(declaration) &&
    ts.isFunctionLike(declaration) &&
    declaration.body !== undefined;
  return hasBody && isProjectDeclaration(declaration) ? declaration : undefined;
}

function isStoredFunction(node) {
  if (ts.isFunctionDeclaration(node) || ts.isClassLike(node)) {
    return true;
  }
  const isFunction = ts.isArrowFunction(node) || ts.isFunctionExpression(node);
  return (
    isFunction && (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent))
  );
}

function isCaughtReceiver(node) {
  const { parent } = node;
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    parent.name.text === 'catch' &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
  );
}

function childrenOf(node) {
  if (ts.isTryStatement(node) && node.catchClause !== undefined) {
    return [node.catchClause, node.finallyBlock].filter((child) => child !== undefined);
  }
  const children = [];
  node.forEachChild((child) => {
    if (!isStoredFunction(child) && !isCaughtReceiver(child)) {
      children.push(child);
    }
  });
  return children;
}

function thrownClass(checker, node) {
  if (!ts.isThrowStatement(node) || node.expression === undefined) {
    return undefined;
  }
  const expression = ts.skipParentheses(node.expression);
  const declaration = ts.isNewExpression(expression)
    ? classDeclarationOf(checker, expression)
    : undefined;
  return declaration !== undefined && isProjectDeclaration(declaration) ? declaration : undefined;
}

function visitBody(walk, item) {
  const nodes = [item.declaration.body];
  for (const node of nodes) {
    const thrown = thrownClass(walk.checker, node);
    if (thrown !== undefined && !walk.thrown.has(thrown)) {
      walk.thrown.set(thrown, item.path);
    }
    const isCall = ts.isCallExpression(node) || ts.isNewExpression(node);
    const callee = isCall ? calledFunction(walk.checker, node) : undefined;
    if (callee !== undefined && item.depth < MAX_DEPTH && !walk.seen.has(callee)) {
      walk.seen.add(callee);
      const path = [...item.path, functionLabel(callee)];
      walk.pending.push({ declaration: callee, path, depth: item.depth + 1 });
    }
    nodes.push(...childrenOf(node));
  }
}

export function thrownClasses(checker, handler) {
  const walk = {
    checker,
    thrown: new Map(),
    seen: new Set([handler]),
    pending: [{ declaration: handler, path: [], depth: 0 }],
  };
  for (const item of walk.pending) {
    if (walk.seen.size > MAX_FUNCTIONS) {
      break;
    }
    visitBody(walk, item);
  }
  return walk.thrown;
}

export function pathText(path) {
  return path.length === 0 ? '' : ` (through ${path.map((step) => `\`${step}\``).join(', ')})`;
}
