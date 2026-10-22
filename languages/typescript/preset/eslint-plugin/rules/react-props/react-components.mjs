import { isComponentName } from '../../../syntax/component-names.mjs';

const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

function isWrapperCall(node) {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  return COMPONENT_WRAPPERS.has(callee.type === 'Identifier' ? callee.name : callee.property?.name);
}

export function declaratorOf(fn) {
  const parent = isWrapperCall(fn.parent) ? fn.parent.parent : fn.parent;
  return parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier'
    ? parent
    : undefined;
}

function functionName(fn) {
  return fn.id?.name ?? declaratorOf(fn)?.id.name;
}

function isJsxValue(expression) {
  const pending = [expression];
  for (const node of pending) {
    if (node?.type === 'JSXElement' || node?.type === 'JSXFragment') {
      return true;
    }
    if (node?.type === 'ConditionalExpression') {
      pending.push(node.consequent, node.alternate);
    }
    if (node?.type === 'LogicalExpression') {
      pending.push(node.left, node.right);
    }
  }
  return false;
}

export function componentVisitor(onComponent) {
  const frames = [];
  function enter(node) {
    frames.push({
      node,
      returnsJsx: node.body.type !== 'BlockStatement' && isJsxValue(node.body),
      ifs: [],
    });
  }
  function exit(node) {
    const frame = frames.pop();
    if (frame.returnsJsx && isComponentName(functionName(node))) {
      onComponent(frame);
    }
  }
  return {
    FunctionDeclaration: enter,
    'FunctionDeclaration:exit': exit,
    FunctionExpression: enter,
    'FunctionExpression:exit': exit,
    ArrowFunctionExpression: enter,
    'ArrowFunctionExpression:exit': exit,
    ReturnStatement(node) {
      if (isJsxValue(node.argument)) {
        frames.at(-1).returnsJsx = true;
      }
    },
    IfStatement(node) {
      frames.at(-1)?.ifs.push(node);
    },
  };
}
