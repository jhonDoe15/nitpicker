import { variableNamed } from '../ancestry.mjs';

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const UTF8_ENCODINGS = new Set(['utf8', 'utf-8']);
const ITERATION_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'flatMap',
  'some',
  'every',
  'find',
  'findLast',
  'endsWith',
  'startsWith',
  'includes',
  'isDirectory',
  'isFile',
  'isSymbolicLink',
  'sort',
  'toSorted',
  'slice',
  'reverse',
  'toReversed',
  'then',
]);

function importedDefinition(sourceCode, definition) {
  if (definition.type === 'ImportBinding') return FS_MODULES.has(definition.parent.source.value);
  const init = definition.type === 'Variable' ? definition.node.init : undefined;
  return (
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    !(variableNamed(sourceCode, init.callee)?.defs.length > 0) &&
    FS_MODULES.has(init.arguments[0]?.value)
  );
}

function stableImportReference(reference) {
  if (reference.isWrite()) return reference.init;
  const node = reference.identifier;
  const member = node.parent;
  if (member.type !== 'MemberExpression' || member.object !== node) return false;
  const owner = member.parent;
  return (
    !(owner.type === 'AssignmentExpression' && owner.left === member) &&
    owner.type !== 'UpdateExpression' &&
    owner.type !== 'UnaryExpression'
  );
}

export function isFsListing(scope, call) {
  const callee = call.callee;
  const identifier = callee.type === 'Identifier' ? callee : callee.object;
  if (identifier?.type !== 'Identifier') return false;
  const variable = variableNamed(scope.sourceCode, identifier);
  return (
    variable?.defs.length === 1 &&
    variable.references.every((reference) =>
      callee.type === 'Identifier'
        ? !reference.isWrite() || reference.init
        : stableImportReference(reference),
    ) &&
    importedDefinition(scope.sourceCode, variable.defs[0])
  );
}

export function usesOrdinaryEncoding(call) {
  const option = call.arguments[1];
  if (option === undefined) return true;
  if (option.type === 'Literal') return UTF8_ENCODINGS.has(option.value);
  if (option.type !== 'ObjectExpression') return false;
  return option.properties.every(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      property.kind === 'init' &&
      !property.method &&
      ((property.key.name ?? property.key.value) !== 'encoding' ||
        (property.value.type === 'Literal' && UTF8_ENCODINGS.has(property.value.value))),
  );
}

function safeMemberReference(member) {
  const owner = member.parent;
  if (owner.type === 'AssignmentExpression' && owner.left === member) return false;
  if (owner.type === 'UpdateExpression' || owner.type === 'UnaryExpression') return false;
  if (owner.type !== 'CallExpression' || owner.callee !== member) return true;
  const method = member.computed ? member.property.value : member.property.name;
  return ITERATION_METHODS.has(method);
}

export function hasUnsafeObjectReferences(variable) {
  return variable.references.some((reference) => {
    if (reference.init) return false;
    const node = reference.identifier;
    const parent = node.parent;
    if (parent.type === 'MemberExpression' && parent.object === node) {
      return !safeMemberReference(parent);
    }
    return parent.type !== 'ForOfStatement' && parent.type !== 'AwaitExpression';
  });
}

export function safeIterationCallback(sourceCode, callback) {
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type)) return false;
  if (callback.params.length > 2) return false;
  return callback.params.every((identifier) => {
    if (identifier.type !== 'Identifier') return false;
    const variable = variableNamed(sourceCode, identifier);
    return variable !== undefined && !hasUnsafeObjectReferences(variable);
  });
}
