import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';

const DRAFT_CALLEES = new Set([
  'produce',
  'produceWithPatches',
  'createSlice',
  'createReducer',
  'useImmer',
  'useImmerReducer',
]);
const ACCUMULATING_CALLEES = new Set(['reduce', 'reduceRight']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const EXPORTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const COPY_METHODS = new Set([
  'slice',
  'concat',
  'toSorted',
  'toReversed',
  'toSpliced',
  'with',
  'map',
  'filter',
  'flat',
  'flatMap',
]);
const COPY_CONSTRUCTORS = new Set(['Set', 'Map', 'Array']);
const COPY_FUNCTIONS = new Set(['structuredClone', 'from']);
const FRESH_CONTAINERS = new Set(['Set', 'Map']);

function calleeName(call) {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
    ? callee.property.name
    : undefined;
}

function subscriptStep(node) {
  if (node.type === 'TSNonNullExpression') {
    return node.expression;
  }
  return node.type === 'MemberExpression' && node.computed ? node.object : undefined;
}

function subscriptRoot(node) {
  const chain = [node];
  for (const current of chain) {
    const next = subscriptStep(current);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const root = chain.at(-1);
  return root.type === 'Identifier' ? root : undefined;
}

function isFreshContainer(node) {
  return (
    (node.type === 'ArrayExpression' && node.elements.length === 0) ||
    (node.type === 'ObjectExpression' && node.properties.length === 0) ||
    (node.type === 'NewExpression' &&
      node.callee.type === 'Identifier' &&
      FRESH_CONTAINERS.has(node.callee.name) &&
      node.arguments.length === 0)
  );
}

function isCopy(node) {
  if (node.type === 'ArrayExpression') {
    return node.elements.some((element) => element?.type === 'SpreadElement');
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.some((property) => property.type === 'SpreadElement');
  }
  if (node.type === 'NewExpression') {
    return node.callee.type === 'Identifier' && COPY_CONSTRUCTORS.has(node.callee.name);
  }
  if (node.type !== 'CallExpression') {
    return false;
  }
  const name = calleeName(node);
  return name !== undefined && (COPY_METHODS.has(name) || COPY_FUNCTIONS.has(name));
}

function isReassignedToCopy(variable, mutation) {
  return variable.references.some(
    (reference) =>
      reference.isWrite() &&
      reference.writeExpr !== undefined &&
      reference.identifier.range[0] < mutation.range[0] &&
      isCopy(reference.writeExpr),
  );
}

function isNamedReducer(sourceCode, owner) {
  const [variable] = sourceCode.getDeclaredVariables(owner);
  return (
    variable?.references.some(({ identifier }) => {
      const call = identifier.parent;
      return (
        call?.type === 'CallExpression' &&
        call.arguments[0] === identifier &&
        ACCUMULATING_CALLEES.has(calleeName(call))
      );
    }) === true
  );
}

function isAccumulator(sourceCode, definition) {
  const owner = definition.node;
  const call = owner.parent;
  const [first] = owner.params;
  const firstName = first?.type === 'AssignmentPattern' ? first.left : first;
  const initial = definition.name.parent;
  const defaulted = initial.type === 'AssignmentPattern' && isFreshContainer(initial.right);
  const inlineReducer =
    call?.type === 'CallExpression' &&
    call.arguments.includes(owner) &&
    ACCUMULATING_CALLEES.has(calleeName(call)) &&
    firstName === definition.name;
  const namedReducer =
    firstName === definition.name && owner.type === 'FunctionDeclaration'
      ? isNamedReducer(sourceCode, owner)
      : false;
  return defaulted || inlineReducer || namedReducer;
}

function isDraft(owner) {
  return ancestorsOf(owner).some(
    (ancestor) => ancestor.type === 'CallExpression' && DRAFT_CALLEES.has(calleeName(ancestor)),
  );
}

function declaredName(statement) {
  const declaration = EXPORTS.has(statement.type) ? statement.declaration : statement;
  if (declaration?.type === 'VariableDeclaration') {
    return declaration.declarations[0]?.id.name;
  }
  return declaration?.id?.name;
}

function isExportedStatement(program, statement) {
  if (EXPORTS.has(statement.type)) {
    return true;
  }
  const name = declaredName(statement);
  return program.body.some(
    (other) =>
      other.type === 'ExportNamedDeclaration' &&
      other.source === null &&
      other.specifiers.some((specifier) => specifier.local.name === name),
  );
}

function isPrivateMember(owner) {
  const member = owner.parent;
  return (
    ['MethodDefinition', 'PropertyDefinition'].includes(member?.type) &&
    (member.accessibility === 'private' || member.key?.type === 'PrivateIdentifier')
  );
}

function isInternalFunction(owner) {
  const ancestors = ancestorsOf(owner);
  const nested = ancestors.some((ancestor) => FUNCTIONS.has(ancestor.type));
  const statement = ancestors.find((ancestor) => ancestor.parent?.type === 'Program');
  const program = statement?.parent;
  return (
    nested ||
    isPrivateMember(owner) ||
    statement === undefined ||
    !isExportedStatement(program, statement)
  );
}

export function changedParameter(sourceCode, target, mutation) {
  const root = subscriptRoot(target);
  const variable = root === undefined ? undefined : variableNamed(sourceCode, root);
  const definition = variable?.defs.at(0);
  if (
    definition?.type !== 'Parameter' ||
    !FUNCTIONS.has(definition.node.type) ||
    definition.name.parent.type === 'RestElement'
  ) {
    return undefined;
  }
  const owner = definition.node;
  const exempt =
    isInternalFunction(owner) ||
    isAccumulator(sourceCode, definition) ||
    isDraft(owner) ||
    isReassignedToCopy(variable, mutation);
  return exempt ? undefined : definition;
}
