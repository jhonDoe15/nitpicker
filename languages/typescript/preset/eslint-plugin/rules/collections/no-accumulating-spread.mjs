import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';

const REDUCE_METHODS = new Set(['reduce', 'reduceRight']);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const LOOP_TYPES = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
const WRAPPER_TYPES = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);
const LITERAL_KINDS = new Map([
  ['ArrayExpression', 'Array'],
  ['ObjectExpression', 'Object'],
]);

const QUADRATIC =
  'Spreading the accumulator copies it again on every step, which is quadratic once it grows with the input';
const OUTSIDE_DOMAIN = 'outside domain/, a const accumulator that a for...of loop fills also works';

export const accumulatingSpreadMessages = {
  reduceObject: `${QUADRATIC}: build the object in one pass with Object.fromEntries(xs.map((x) => [x.key, x.value])), Object.assign({}, ...xs), Object.groupBy or new Map(xs.map((x) => [x.key, x])); ${OUTSIDE_DOMAIN}.`,
  reduceArray: `${QUADRATIC}: build the array in one pass with xs.flatMap((x) => x.items), xs.map or xs.filter; ${OUTSIDE_DOMAIN}.`,
  reduce: `${QUADRATIC}: build the value in one pass with map, flatMap or filter and wrap it once (Object.fromEntries, new Set, new Map); ${OUTSIDE_DOMAIN}.`,
  loopArray: `${QUADRATIC}: build the array with xs.map, xs.flatMap or xs.filter, or declare it const before the loop and push onto it.`,
  loopObject: `${QUADRATIC}: build the object with Object.fromEntries(xs.map((x) => [x.key, x.value])) or Object.assign({}, ...parts), or declare it const (or a Map) before the loop and set its keys.`,
};

function innerExpression(node) {
  return chainOf(node, (current) =>
    WRAPPER_TYPES.has(current.type) ? current.expression : undefined,
  ).at(-1);
}

function contains(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function staticPropertyName(member) {
  const { property } = member;
  if (!member.computed) {
    return property.type === 'Identifier' ? property.name : undefined;
  }
  if (property.type === 'Literal') {
    return typeof property.value === 'string' ? property.value : undefined;
  }
  return property.type === 'TemplateLiteral' && property.expressions.length === 0
    ? property.quasis[0].value.cooked
    : undefined;
}

function isReduceCall(node) {
  if (node.type !== 'CallExpression' || node.arguments.length < 1 || node.arguments.length > 2) {
    return false;
  }
  const callee = node.callee.type === 'ChainExpression' ? node.callee.expression : node.callee;
  return callee.type === 'MemberExpression' && REDUCE_METHODS.has(staticPropertyName(callee));
}

function bindingIdentifier(parameter) {
  if (parameter?.type === 'Identifier') {
    return parameter;
  }
  return parameter?.type === 'AssignmentPattern' && parameter.left.type === 'Identifier'
    ? parameter.left
    : undefined;
}

function formalParameters(fn) {
  return fn.params.filter(
    (parameter) => parameter.type !== 'Identifier' || parameter.name !== 'this',
  );
}

function reduceMessageId(call) {
  const initial = call.arguments[1];
  const kind =
    initial === undefined || initial.type === 'SpreadElement'
      ? undefined
      : LITERAL_KINDS.get(innerExpression(initial).type);
  return kind === undefined ? 'reduce' : `reduce${kind}`;
}

function reduceReport(definition, spread) {
  const fn = definition.node;
  const parameters = formalParameters(fn);
  if (parameters.length !== 2 || bindingIdentifier(parameters[0]) !== definition.name) {
    return undefined;
  }
  const call = fn.parent;
  if (!isReduceCall(call) || call.arguments[0] !== fn) {
    return undefined;
  }
  return ancestorsOf(spread).find((node) => FUNCTION_TYPES.has(node.type)) === fn
    ? { descriptor: { node: spread, messageId: reduceMessageId(call) } }
    : undefined;
}

function firstAssignment(variable) {
  const write = variable.references.find((reference) => reference.isWrite() && !reference.init);
  const assignment = write?.identifier.parent;
  return assignment?.type === 'AssignmentExpression' && assignment.left === write.identifier
    ? assignment
    : undefined;
}

function declaredNameLocation(sourceCode, id) {
  const start = id.range[0];
  const end =
    id.type === 'Identifier'
      ? start + id.name.length
      : (id.typeAnnotation === undefined ? id : sourceCode.getTokenBefore(id.typeAnnotation))
          .range[1];
  return { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(end) };
}

function loopReport({ definition, variable, spread, sourceCode }) {
  const declaration = definition.parent;
  if (declaration.kind !== 'let') {
    return undefined;
  }
  const assignment = firstAssignment(variable);
  const value = assignment === undefined ? undefined : innerExpression(assignment.right);
  const kind = value === undefined ? undefined : LITERAL_KINDS.get(value.type);
  if (kind === undefined || !contains(value, spread)) {
    return undefined;
  }
  const loop = ancestorsOf(spread).find(
    (node) => LOOP_TYPES.has(node.type) && !contains(node, declaration),
  );
  return loop === undefined
    ? undefined
    : {
        declarator: definition.node,
        descriptor: {
          loc: declaredNameLocation(sourceCode, definition.node.id),
          messageId: `loop${kind}`,
        },
      };
}

function resolvedVariable(sourceCode, identifier) {
  return sourceCode
    .getScope(identifier)
    .references.find((reference) => reference.identifier === identifier)?.resolved;
}

function spreadReport(spread, sourceCode) {
  const { argument } = spread;
  if (argument.type !== 'Identifier' || sourceCode.getTokenBefore(argument).value === '(') {
    return undefined;
  }
  const variable = resolvedVariable(sourceCode, argument);
  const definition = variable?.defs[0];
  if (definition?.type === 'Parameter') {
    return reduceReport(definition, spread);
  }
  return definition?.type === 'Variable'
    ? loopReport({ definition, variable, spread, sourceCode })
    : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow spreading a reduce accumulator or a loop accumulator into its own next value',
    },
    schema: [],
    messages: accumulatingSpreadMessages,
  },
  create(context) {
    const { sourceCode } = context;
    const reportedDeclarators = new Set();
    return {
      SpreadElement(spread) {
        const report = spreadReport(spread, sourceCode);
        if (report === undefined || reportedDeclarators.has(report.declarator)) {
          return;
        }
        if (report.declarator !== undefined) {
          reportedDeclarators.add(report.declarator);
        }
        context.report(report.descriptor);
      },
    };
  },
};
