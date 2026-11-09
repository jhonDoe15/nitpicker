import { term, withRange } from '../../../../../../../shared/logic/terms.mjs';
import { foldTree } from '../../../../../../../shared/traversal.mjs';

const TRANSPARENT = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);

const LOOSE = new Set(['SequenceExpression', 'AssignmentExpression', 'YieldExpression']);

const OPERATORS = new Map([
  ['UnaryExpression', 'unary'],
  ['BinaryExpression', 'binary'],
  ['LogicalExpression', 'logical'],
]);

const JUMPS = new Map([
  ['BreakStatement', 'break'],
  ['ContinueStatement', 'continue'],
]);

const VALUE_STATEMENTS = new Map([
  ['ReturnStatement', 'return'],
  ['ThrowStatement', 'throw'],
  ['ExpressionStatement', 'expression'],
]);

function isModeledMember(node) {
  return !node.optional && node.object.type !== 'Super';
}

function isModeled(node) {
  switch (node.type) {
    case 'UnaryExpression': {
      return node.operator !== 'delete';
    }
    case 'BinaryExpression': {
      return node.left.type !== 'PrivateIdentifier';
    }
    case 'MemberExpression': {
      return isModeledMember(node);
    }
    case 'CallExpression': {
      return !node.optional && node.callee.type !== 'Super';
    }
    case 'TemplateLiteral': {
      return node.expressions.length === 0;
    }
    case 'Literal': {
      return node.regex === undefined;
    }
    default: {
      return true;
    }
  }
}

const COMPOSITES = new Set([
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'MemberExpression',
  'CallExpression',
  'BlockStatement',
  'IfStatement',
  'ReturnStatement',
  'ThrowStatement',
  'ExpressionStatement',
]);

function isComposite(node) {
  return COMPOSITES.has(node.type) && isModeled(node);
}

/** Whether `toTerm` models `node` with its parts, so an expression inside it is part of its term. */
export function isTermPart(node) {
  return TRANSPARENT.has(node.type) || isComposite(node);
}

function fieldsOf(node) {
  switch (node.type) {
    case 'UnaryExpression':
    case 'ReturnStatement':
    case 'ThrowStatement': {
      return [node.argument];
    }
    case 'BinaryExpression':
    case 'LogicalExpression': {
      return [node.left, node.right];
    }
    case 'ConditionalExpression':
    case 'IfStatement': {
      return [node.test, node.consequent, node.alternate];
    }
    case 'MemberExpression': {
      return node.computed ? [node.object, node.property] : [node.object];
    }
    case 'CallExpression': {
      return [node.callee, ...node.arguments];
    }
    case 'BlockStatement': {
      return node.body;
    }
    default: {
      return [node.expression];
    }
  }
}

function parts(node) {
  if (TRANSPARENT.has(node.type)) {
    return [node.expression];
  }
  return isComposite(node)
    ? fieldsOf(node).filter((child) => child !== null && child !== undefined)
    : [];
}

function literalValue(node) {
  if (typeof node.value === 'string') {
    return JSON.stringify(node.value);
  }
  if (typeof node.value === 'number') {
    return String(node.value);
  }
  if (typeof node.bigint === 'string') {
    return `${BigInt(node.bigint).toString()}n`;
  }
  const isNull = node.value === null && node.regex === undefined && node.bigint === undefined;
  return isNull ? 'null' : node.raw;
}

function asBlock(statement) {
  return statement.kind === 'block'
    ? statement
    : withRange(term('block', undefined, [statement]), statement.range);
}

function leaf(node, sourceCode) {
  if (!isModeled(node)) {
    return opaque(node, sourceCode.getText(node));
  }
  switch (node.type) {
    case 'Literal': {
      return term('literal', literalValue(node));
    }
    case 'TemplateLiteral': {
      return term(
        'literal',
        JSON.stringify(node.quasis.map((quasi) => quasi.value.cooked).join('')),
      );
    }
    case 'Identifier': {
      return term('name', node.name);
    }
    case 'ThisExpression': {
      return term('this');
    }
    default: {
      return JUMPS.has(node.type)
        ? term(JUMPS.get(node.type), node.label?.name)
        : opaque(node, sourceCode.getText(node));
    }
  }
}

function opaque(node, text) {
  if (node.type.endsWith('Declaration')) {
    return term('declaration', text);
  }
  if (node.type.endsWith('Statement')) {
    return term('statement', text);
  }
  if (node.type === 'ArrowFunctionExpression') {
    return { ...term('opaque', text), loose: true, assignment: true };
  }
  return LOOSE.has(node.type) ? { ...term('opaque', text), loose: true } : term('opaque', text);
}

function composite(node, children) {
  if (OPERATORS.has(node.type)) {
    return term(OPERATORS.get(node.type), node.operator, children);
  }
  if (VALUE_STATEMENTS.has(node.type)) {
    return term(VALUE_STATEMENTS.get(node.type), undefined, children);
  }
  switch (node.type) {
    case 'ConditionalExpression': {
      return term('conditional', undefined, children);
    }
    case 'MemberExpression': {
      const name =
        node.property.type === 'PrivateIdentifier' ? `#${node.property.name}` : node.property.name;
      return node.computed ? term('index', undefined, children) : term('member', name, children);
    }
    case 'CallExpression': {
      return term('call', undefined, children);
    }
    case 'IfStatement': {
      const [test, ...branches] = children;
      return term('if', undefined, [test, ...branches.map(asBlock)]);
    }
    default: {
      return term('block', undefined, children);
    }
  }
}

function never() {
  return false;
}

function made(node, children, { sourceCode, isBoolean, isInteger }) {
  if (TRANSPARENT.has(node.type)) {
    return children[0];
  }
  const shape = isComposite(node) ? composite(node, children) : leaf(node, sourceCode);
  const placed = withRange(shape, node.range);
  return {
    ...placed,
    ...(isBoolean(node) ? { boolean: true } : {}),
    ...(isInteger(node) ? { integer: true } : {}),
  };
}

export function toTerm(root, sourceCode, { isBoolean = never, isInteger = never } = {}) {
  const options = { sourceCode, isBoolean, isInteger };
  return foldTree(root, undefined, {
    expand: (node) => parts(node).map((child) => [child]),
    combine: (node, _context, children) => made(node, children, options),
  });
}
