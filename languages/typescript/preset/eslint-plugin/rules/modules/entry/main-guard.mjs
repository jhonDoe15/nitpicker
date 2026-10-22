import { variableNamed } from '../../analysis/ancestry.mjs';

const EQUALITY = ['===', '=='];
const PROCESS_MODULES = new Set(['process', 'node:process']);
const IMPORTED_HELPERS = new Map([
  ['pathToFileURL', new Set(['url', 'node:url'])],
  ['realpathSync', new Set(['fs', 'node:fs'])],
]);

function isProcessImport(definition) {
  return (
    definition.type === 'ImportBinding' &&
    definition.node.type !== 'ImportSpecifier' &&
    PROCESS_MODULES.has(definition.parent.source.value)
  );
}

function isGlobal(sourceCode, node, name) {
  if (node.type !== 'Identifier' || node.name !== name) {
    return false;
  }
  const definitions = variableNamed(sourceCode, node)?.defs ?? [];
  return name === 'process' ? definitions.every(isProcessImport) : definitions.length === 0;
}

function isImportedHelper(sourceCode, node, name) {
  const [definition, ...others] = variableNamed(sourceCode, node)?.defs ?? [];
  return (
    node.type === 'Identifier' &&
    node.name === name &&
    others.length === 0 &&
    definition?.type === 'ImportBinding' &&
    definition.node.type === 'ImportSpecifier' &&
    definition.node.imported.name === name &&
    IMPORTED_HELPERS.get(name).has(definition.parent.source.value)
  );
}

function isMember(node, property) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    !node.optional &&
    node.property.name === property
  );
}

function isImportMeta(node, property) {
  return (
    isMember(node, property) &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import'
  );
}

function isScriptPath(sourceCode, node) {
  return (
    node.type === 'MemberExpression' &&
    node.computed &&
    !node.optional &&
    node.property.type === 'Literal' &&
    node.property.value === 1 &&
    isMember(node.object, 'argv') &&
    isGlobal(sourceCode, node.object.object, 'process')
  );
}

function isHelperCall(sourceCode, node, { name, argument }) {
  return (
    node.type === 'CallExpression' &&
    !node.optional &&
    node.arguments.length === 1 &&
    isImportedHelper(sourceCode, node.callee, name) &&
    argument(node.arguments[0])
  );
}

function isFilePath(sourceCode, node) {
  return (
    isScriptPath(sourceCode, node) ||
    isHelperCall(sourceCode, node, {
      name: 'realpathSync',
      argument: (argument) => isScriptPath(sourceCode, argument),
    })
  );
}

function isScriptUrl(sourceCode, node) {
  return (
    isScriptPath(sourceCode, node) ||
    (isMember(node, 'href') &&
      isHelperCall(sourceCode, node.object, {
        name: 'pathToFileURL',
        argument: (argument) => isFilePath(sourceCode, argument),
      })) ||
    (node.type === 'TemplateLiteral' &&
      node.quasis.map((quasi) => quasi.value.cooked).join('|') === 'file://|' &&
      isScriptPath(sourceCode, node.expressions[0]))
  );
}

function isComparison(test, operators, [left, right]) {
  return (
    test.type === 'BinaryExpression' &&
    operators.includes(test.operator) &&
    ((left(test.left) && right(test.right)) || (left(test.right) && right(test.left)))
  );
}

function isEntryComparison(sourceCode, test) {
  return (
    isImportMeta(test, 'main') ||
    isComparison(test, EQUALITY, [
      (side) => isImportMeta(side, 'url'),
      (side) => isScriptUrl(sourceCode, side),
    ]) ||
    isComparison(test, EQUALITY, [
      (side) => isMember(side, 'main') && isGlobal(sourceCode, side.object, 'require'),
      (side) => isGlobal(sourceCode, side, 'module'),
    ])
  );
}

function isScriptPathCheck(sourceCode, test) {
  return (
    isScriptPath(sourceCode, test) ||
    isComparison(
      test,
      ['!=='],
      [(side) => isScriptPath(sourceCode, side), (side) => isGlobal(sourceCode, side, 'undefined')],
    )
  );
}

function conjuncts(test) {
  const pending = [test];
  const operands = [];
  for (const node of pending) {
    if (node.type === 'LogicalExpression' && node.operator === '&&') {
      pending.push(node.left, node.right);
    } else {
      operands.push(node);
    }
  }
  return operands;
}

function isEntryCheck(sourceCode, test) {
  const operands = conjuncts(test);
  return (
    operands.some((operand) => isEntryComparison(sourceCode, operand)) &&
    operands.every(
      (operand) => isEntryComparison(sourceCode, operand) || isScriptPathCheck(sourceCode, operand),
    )
  );
}

export function isMainGuard(statement, sourceCode) {
  return (
    statement.type === 'IfStatement' &&
    statement.alternate === null &&
    isEntryCheck(sourceCode, statement.test)
  );
}

export function guardedByMain(statement, node, sourceCode) {
  if (!isMainGuard(statement, sourceCode)) {
    return false;
  }
  const [start, end] = statement.consequent.range;
  return start <= node.range[0] && node.range[1] <= end;
}
