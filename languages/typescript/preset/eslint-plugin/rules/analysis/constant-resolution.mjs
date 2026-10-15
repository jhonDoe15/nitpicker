import { scopeChain } from './ancestry.mjs';

const MAX_RESOLVE_DEPTH = 8;

export function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

export function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? undefined;
  }
  return undefined;
}

export function findVariable(context, node, name) {
  for (const scope of scopeChain(context.sourceCode.getScope(node))) {
    const variable = scope.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

function constantInitializer(context, node, depth) {
  if (node?.type !== 'Identifier' || depth > MAX_RESOLVE_DEPTH) return undefined;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === 'Identifier'
    ? definition.node.init
    : undefined;
}

export function resolveConstant(context, node, depth = 0) {
  const chain = [node];
  for (const current of chain) {
    const next = constantInitializer(context, current, depth + chain.length - 1);
    if (next) chain.push(next);
  }
  return chain.at(-1);
}

export function resolveFunction(context, node) {
  if (node?.type !== 'Identifier') return undefined;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === 'FunctionName') return definition.node;
  if (definition?.type === 'Variable' && definition.parent.kind === 'const') {
    const init = definition.node.init;
    return isFunctionNode(init) ? init : undefined;
  }
  return undefined;
}

const NUMBER_OPERATORS = {
  '*': (left, right) => left * right,
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '/': (left, right) => left / right,
};

function operandNodes(node) {
  if (node?.type === 'UnaryExpression' && ['-', '+'].includes(node.operator)) {
    return [node.argument];
  }
  if (node?.type === 'BinaryExpression' && Object.hasOwn(NUMBER_OPERATORS, node.operator)) {
    return [node.left, node.right];
  }
  return [];
}

function numericEntry(context, node, depth, parent) {
  return {
    node: depth > MAX_RESOLVE_DEPTH ? undefined : resolveConstant(context, node),
    depth,
    parent,
  };
}

function numericEntries(context, root, depth) {
  const entries = [numericEntry(context, root, depth, undefined)];
  for (const entry of entries) {
    const operands = operandNodes(entry.node);
    entries.push(
      ...operands.map((operand) => numericEntry(context, operand, entry.depth + 1, entry)),
    );
  }
  return entries;
}

function numericValue(node, operands) {
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (operands.length === 0 || operands.includes(undefined)) return undefined;
  if (node.type === 'UnaryExpression') return node.operator === '-' ? -operands[0] : operands[0];
  return NUMBER_OPERATORS[node.operator](...operands);
}

export function constantNumber(context, node, depth = 0) {
  const entries = numericEntries(context, node, depth);
  const values = new Map();
  for (const entry of entries.toReversed()) {
    const operands = entries
      .filter(({ parent }) => parent === entry)
      .map((operand) => values.get(operand));
    values.set(entry, numericValue(entry.node, operands));
  }
  return values.get(entries[0]);
}
