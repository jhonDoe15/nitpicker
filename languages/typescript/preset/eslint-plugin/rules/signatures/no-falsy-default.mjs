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

const WIDE_CLASSES = [
  [ts.TypeFlags.String, 'string'],
  [ts.TypeFlags.Number, 'number'],
  [ts.TypeFlags.BigInt, 'bigint'],
];
const FALSY_LITERALS = [
  ['', 'string'],
  [0, 'number'],
  [false, 'boolean'],
];

function falsyClassOf(part) {
  const { flags } = part;
  const wide = WIDE_CLASSES.find(([flag]) => flags & flag);
  if (wide !== undefined) {
    return wide[1];
  }
  const narrow = [
    [ts.TypeFlags.BooleanLiteral, part.intrinsicName === 'false', 'boolean'],
    [ts.TypeFlags.StringLiteral, part.value === '', 'string'],
    [ts.TypeFlags.NumberLiteral, Number(part.value) === 0, 'number'],
  ];
  return narrow.find(([flag, falsy]) => flags & flag && falsy)?.[2];
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
    return node.bigint === '0'
      ? 'bigint'
      : FALSY_LITERALS.find(([value]) => value === node.value)?.[1];
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

function isOr(node) {
  return node.type === 'LogicalExpression' && node.operator === '||';
}

function operandsOf(node) {
  const pending = [node];
  const operands = [];
  for (const current of pending) {
    if (isOr(current)) {
      pending.push(current.left, current.right);
    } else {
      operands.push(current);
    }
  }
  return operands.toSorted((left, right) => left.range[0] - right.range[0]);
}

function isOuterChain(node) {
  const { parent } = node;
  return !(parent.type === 'LogicalExpression' && parent.operator === '||' && parent.left === node);
}

function isAnd(node) {
  return node.type === 'LogicalExpression' && node.operator === '&&';
}

function isTruthTest(parent, child) {
  if (isAnd(parent)) {
    return true;
  }
  if (parent.type === 'UnaryExpression') {
    return parent.operator === '!';
  }
  if (TEST_PARENTS.has(parent.type)) {
    return parent.test === child;
  }
  return (
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    TRUTH_CALLS.has(parent.callee.name)
  );
}

const TRANSPARENT = new Set(['LogicalExpression', 'TSNonNullExpression']);

function isCondition(node) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (!TRANSPARENT.has(parent.type) || isAnd(parent)) {
      return isTruthTest(parent, child);
    }
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
      const parameters = identifiers.filter(
        (identifier) => identifier.type === 'Identifier' && isParameter(sourceCode, identifier),
      );
      for (const identifier of parameters) {
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
