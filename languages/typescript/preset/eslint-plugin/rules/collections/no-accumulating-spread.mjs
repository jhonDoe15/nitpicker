import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import {
  accumulatingSpreadMessageId,
  accumulatingSpreadMessages,
} from './accumulating-spread-messages.mjs';

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

function reduceKind(call) {
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
    ? { kind: reduceKind(call), descriptor: { node: spread } }
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
        kind: `loop${kind}`,
        descriptor: { loc: declaredNameLocation(sourceCode, definition.node.id) },
      };
}

function isNumber(node) {
  const literal = node?.type === 'UnaryExpression' && node.operator === '-' ? node.argument : node;
  return literal?.type === 'Literal' && typeof literal.value === 'number';
}

function isBoundingSlice(array) {
  const member = array.parent;
  const call = member.parent;
  if (
    member.type !== 'MemberExpression' ||
    member.object !== array ||
    member.computed ||
    member.property.name !== 'slice' ||
    call.type !== 'CallExpression' ||
    call.callee !== member
  ) {
    return false;
  }
  const [start, end] = call.arguments;
  return call.arguments.length === 2
    ? isNumber(start) && isNumber(end)
    : call.arguments.length === 1 && start.type === 'UnaryExpression' && isNumber(start);
}

function isFixedShape(spread) {
  const container = spread.parent;
  if (container.type === 'ObjectExpression') {
    return container.properties.every(
      (property) => property === spread || (property.type === 'Property' && !property.computed),
    );
  }
  return container.type === 'ArrayExpression' && isBoundingSlice(container);
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
    const seenDeclarators = new Set();
    return {
      SpreadElement(spread) {
        const report = spreadReport(spread, sourceCode);
        if (report === undefined || seenDeclarators.has(report.declarator)) {
          return;
        }
        if (report.declarator !== undefined) {
          seenDeclarators.add(report.declarator);
        }
        if (!isFixedShape(spread)) {
          const messageId = accumulatingSpreadMessageId(report.kind, context.filename);
          context.report({ ...report.descriptor, messageId });
        }
      },
    };
  },
};
