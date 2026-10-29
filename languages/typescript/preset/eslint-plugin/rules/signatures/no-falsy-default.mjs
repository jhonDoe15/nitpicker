import ts from 'typescript';
import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TEST_PARENTS = new Set([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ConditionalExpression',
]);
const TRUTH_CALLS = new Set(['Boolean']);
const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

function isZero(value) {
  return value === 0 || value === 0n;
}

function falsyClassOf(part) {
  const { flags } = part;
  if (flags & ts.TypeFlags.String) return 'string';
  if (flags & ts.TypeFlags.Number) return 'number';
  if (flags & ts.TypeFlags.BigInt) return 'bigint';
  if (flags & ts.TypeFlags.BooleanLiteral)
    return part.intrinsicName === 'false' ? 'boolean' : undefined;
  if (flags & ts.TypeFlags.StringLiteral) return part.value === '' ? 'string' : undefined;
  if (flags & ts.TypeFlags.NumberLiteral) return isZero(part.value) ? 'number' : undefined;
  return undefined;
}

function partsOf(type) {
  return type.isUnion() ? type.types : [type];
}

function falsyClasses(type) {
  const parts = partsOf(type);
  const nullable = parts.some((part) => part.flags & NULLISH);
  const classes = new Set(parts.map(falsyClassOf).filter((name) => name !== undefined));
  return nullable ? classes : new Set();
}

function literalClass(node) {
  if (node.type === 'Literal') {
    if (node.value === '') return 'string';
    if (node.value === 0) return 'number';
    if (node.value === false) return 'boolean';
    return node.bigint === '0' ? 'bigint' : undefined;
  }
  return node.type === 'TemplateLiteral' &&
    node.quasis.length === 1 &&
    node.quasis[0].value.cooked === ''
    ? 'string'
    : undefined;
}

function isAbsentValue(node) {
  return (
    (node.type === 'Identifier' && node.name === 'undefined') ||
    (node.type === 'Literal' && node.value === null)
  );
}

function operandsOf(node) {
  const operands = [];
  let current = node;
  while (current.type === 'LogicalExpression' && current.operator === '||') {
    operands.unshift(current.right);
    current = current.left;
  }
  return [current, ...operands];
}

function isOuterChain(node) {
  const { parent } = node;
  return !(parent.type === 'LogicalExpression' && parent.operator === '||' && parent.left === node);
}

function isCondition(node) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (parent.type === 'LogicalExpression' && parent.operator === '&&') return true;
    if (parent.type === 'UnaryExpression') return parent.operator === '!';
    if (TEST_PARENTS.has(parent.type)) return parent.test === child;
    if (parent.type === 'CallExpression') {
      return parent.callee.type === 'Identifier' && TRUTH_CALLS.has(parent.callee.name);
    }
    if (parent.type !== 'LogicalExpression' && parent.type !== 'TSNonNullExpression') return false;
    child = parent;
  }
  return false;
}

function isParameter(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return definition?.type === 'Parameter' && FUNCTIONS.has(definition.node.type);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow replacing a falsy parameter with a default through || or a ternary',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      falsyDefault:
        "`{{ name }}` is replaced by the default whenever it is falsy, so `0`, `''` and `false` count as not given. Default only `undefined` with `??` (`limit ?? DEFAULT_LIMIT`), or test `limit === undefined`.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }

    function check(report, identifiers, fallback) {
      if (isAbsentValue(fallback)) {
        return;
      }
      const finalClass = literalClass(fallback);
      for (const identifier of identifiers) {
        if (identifier.type !== 'Identifier' || !isParameter(sourceCode, identifier)) continue;
        const classes = falsyClasses(services.getTypeAtLocation(identifier));
        const equal = classes.size === 1 && classes.has(finalClass);
        if (classes.size > 0 && !equal && !isCondition(report)) {
          context.report({
            node: identifier,
            messageId: 'falsyDefault',
            data: { name: identifier.name },
          });
        }
      }
    }

    return {
      LogicalExpression(node) {
        if (node.operator === '||' && isOuterChain(node)) {
          const operands = operandsOf(node);
          check(node, operands.slice(0, -1), operands.at(-1));
        }
      },
      ConditionalExpression(node) {
        const same =
          node.test.type === 'Identifier' &&
          node.consequent.type === 'Identifier' &&
          node.test.name === node.consequent.name;
        if (same) {
          check(node, [node.test], node.alternate);
        }
      },
    };
  },
};
