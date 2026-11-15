import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type Ranged, type SourceCode } from '../../typed/node-views.mts';
import { operandsOf } from '../../typed/syntax-views.mts';

type Predicate = (node: TSESTree.Node) => boolean;
type HelperCall = { readonly name: string; readonly argument: Predicate };

const { DefinitionType } = TSESLint.Scope;

const EQUALITY = ['===', '=='];
const PROCESS_GLOBAL = 'process';
const PROCESS_MODULES = new Set([PROCESS_GLOBAL, 'node:process']);
const IMPORTED_HELPERS = new Map([
  ['pathToFileURL', new Set(['url', 'node:url'])],
  ['realpathSync', new Set(['fs', 'node:fs'])],
]);

function isProcessImport(definition: TSESLint.Scope.Definition): boolean {
  return (
    definition.type === DefinitionType.ImportBinding &&
    definition.node.type !== AST_NODE_TYPES.ImportSpecifier &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    PROCESS_MODULES.has(definition.parent.source.value)
  );
}

function isGlobal(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || node.name !== name) {
    return false;
  }
  const definitions = variableNamed(sourceCode, node)?.defs ?? [];
  return name === PROCESS_GLOBAL ? definitions.every(isProcessImport) : definitions.length === 0;
}

function isImportedHelper(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || node.name !== name) {
    return false;
  }
  const [definition, ...others] = variableNamed(sourceCode, node)?.defs ?? [];
  return (
    others.length === 0 &&
    definition?.type === DefinitionType.ImportBinding &&
    definition.node.type === AST_NODE_TYPES.ImportSpecifier &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    nameOf(definition.node.imported) === name &&
    IMPORTED_HELPERS.get(name)?.has(definition.parent.source.value) === true
  );
}

function isMember(node: TSESTree.Node, property: string): node is TSESTree.MemberExpression {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    !node.optional &&
    nameOf(node.property) === property
  );
}

function isImportMeta(node: TSESTree.Node, property: string): boolean {
  return (
    isMember(node, property) &&
    node.object.type === AST_NODE_TYPES.MetaProperty &&
    node.object.meta.name === 'import'
  );
}

function isScriptPath(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.computed &&
    !node.optional &&
    node.property.type === AST_NODE_TYPES.Literal &&
    node.property.value === 1 &&
    isMember(node.object, 'argv') &&
    isGlobal(sourceCode, node.object.object, PROCESS_GLOBAL)
  );
}

function isHelperCall(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  { name, argument }: HelperCall,
): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    !node.optional &&
    node.arguments.length === 1 &&
    isImportedHelper(sourceCode, node.callee, name) &&
    node.arguments.every((each) => argument(each))
  );
}

function isFilePath(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    isScriptPath(sourceCode, node) ||
    isHelperCall(sourceCode, node, {
      name: 'realpathSync',
      argument: (argument) => isScriptPath(sourceCode, argument),
    })
  );
}

function startsWithScriptPath(
  sourceCode: SourceCode,
  expressions: readonly TSESTree.Node[],
): boolean {
  const [first] = expressions;
  return first !== undefined && isScriptPath(sourceCode, first);
}

function isScriptUrl(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    isScriptPath(sourceCode, node) ||
    (isMember(node, 'href') &&
      isHelperCall(sourceCode, node.object, {
        name: 'pathToFileURL',
        argument: (argument) => isFilePath(sourceCode, argument),
      })) ||
    (node.type === AST_NODE_TYPES.TemplateLiteral &&
      node.quasis.map((quasi) => quasi.value.cooked).join('|') === 'file://|' &&
      startsWithScriptPath(sourceCode, node.expressions))
  );
}

function isComparison(
  test: TSESTree.Node,
  operators: readonly string[],
  [left, right]: readonly [Predicate, Predicate],
): boolean {
  return (
    test.type === AST_NODE_TYPES.BinaryExpression &&
    operators.includes(test.operator) &&
    ((left(test.left) && right(test.right)) || (left(test.right) && right(test.left)))
  );
}

function isEntryComparison(sourceCode: SourceCode, test: TSESTree.Node): boolean {
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

function isScriptPathCheck(sourceCode: SourceCode, test: TSESTree.Node): boolean {
  return (
    isScriptPath(sourceCode, test) ||
    isComparison(
      test,
      ['!=='],
      [(side) => isScriptPath(sourceCode, side), (side) => isGlobal(sourceCode, side, 'undefined')],
    )
  );
}

function isEntryCheck(sourceCode: SourceCode, test: TSESTree.Expression): boolean {
  const operands = operandsOf(test, '&&');
  return (
    operands.some((operand) => isEntryComparison(sourceCode, operand)) &&
    operands.every(
      (operand) => isEntryComparison(sourceCode, operand) || isScriptPathCheck(sourceCode, operand),
    )
  );
}

export function isMainGuard(statement: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    statement.type === AST_NODE_TYPES.IfStatement &&
    statement.alternate === null &&
    isEntryCheck(sourceCode, statement.test)
  );
}

export function guardedByMain(
  statement: TSESTree.Node,
  node: Ranged,
  sourceCode: SourceCode,
): boolean {
  if (statement.type !== AST_NODE_TYPES.IfStatement || !isMainGuard(statement, sourceCode)) {
    return false;
  }
  const [start, end] = statement.consequent.range;
  return start <= node.range[0] && node.range[1] <= end;
}
