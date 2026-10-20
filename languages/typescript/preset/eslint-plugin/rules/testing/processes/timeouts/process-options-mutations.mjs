import { chainOf, variableNamed } from '../../../analysis/ancestry.mjs';

const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function unwrapped(node) {
  return chainOf(node, (current) =>
    TYPE_WRAPPERS.has(current?.type) ? current.expression : undefined,
  ).at(-1);
}

function throughMembers(identifier) {
  const chain = [identifier];
  for (const node of chain) {
    if (
      (node.parent?.type === 'MemberExpression' && node.parent.object === node) ||
      (TYPE_WRAPPERS.has(node.parent?.type) && node.parent.expression === node)
    ) {
      chain.push(node.parent);
    }
  }
  return chain.at(-1);
}

function aliasOf(identifier) {
  const value = chainOf(identifier, (node) =>
    TYPE_WRAPPERS.has(node.parent?.type) ? node.parent : undefined,
  ).at(-1);
  const parent = value.parent;
  return parent?.type === 'VariableDeclarator' &&
    parent.init === value &&
    parent.id.type === 'Identifier' &&
    parent.parent.kind === 'const'
    ? parent.id
    : undefined;
}

function canMutate(identifier) {
  const outer = throughMembers(identifier);
  const parent = outer.parent;
  if (parent?.type === 'AssignmentExpression') {
    return true;
  }
  if (parent?.type === 'UpdateExpression') {
    return true;
  }
  if (parent?.type === 'UnaryExpression' && parent.operator === 'delete') {
    return true;
  }
  if (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') {
    return true;
  }
  return ['ReturnStatement', 'ArrowFunctionExpression', 'Property', 'ArrayExpression'].includes(
    parent?.type,
  );
}

function initializerAliases(variable) {
  const initializer = unwrapped(variable.defs[0]?.node.init);
  return initializer?.type === 'Identifier' ? [initializer] : [];
}

function inspectReferences(context, variable, call) {
  const aliases = initializerAliases(variable);
  const callScope = context.sourceCode.getScope(call).variableScope;
  for (const reference of variable.references) {
    const name = reference.identifier;
    const afterCall = reference.from.variableScope === callScope && name.range[0] >= call.range[0];
    if (reference.init || afterCall) {
      continue;
    }
    const alias = aliasOf(name);
    if (alias !== undefined) {
      aliases.push(alias);
    } else if (canMutate(name)) {
      return { mutated: true, aliases };
    }
  }
  return { mutated: false, aliases };
}

export function optionsMayChange(context, node, call) {
  const initial = unwrapped(node);
  if (initial?.type !== 'Identifier') {
    return false;
  }
  const pending = [initial];
  const visited = new Set();
  for (const identifier of pending) {
    const variable = variableNamed(context.sourceCode, identifier);
    if (variable === undefined || visited.has(variable)) {
      continue;
    }
    visited.add(variable);
    const inspected = inspectReferences(context, variable, call);
    if (inspected.mutated) {
      return true;
    }
    pending.push(...inspected.aliases);
  }
  return false;
}
