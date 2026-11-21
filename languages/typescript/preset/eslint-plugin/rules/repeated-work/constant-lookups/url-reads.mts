import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { globalName } from '../../reuse/construction-kinds.mts';
import { memberName, outerOf } from '../../collections/costly-forms/repeated-runs.mts';
import { isAssignmentTarget } from '../../collections/costly-forms/receivers/read-only-uses.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';

const URL_PARTS = new Set([
  'hash',
  'host',
  'hostname',
  'href',
  'origin',
  'password',
  'pathname',
  'port',
  'protocol',
  'search',
  'username',
]);
const URL_TEXTS = new Set(['toJSON', 'toString']);

function isPartRead(node: TSESTree.Node): boolean {
  const outer = outerOf(node);
  const member = outer.parent;
  if (member?.type !== AST_NODE_TYPES.MemberExpression || member.object !== outer) {
    return false;
  }
  const name = memberName(member) ?? '';
  const call = outerOf(member).parent;
  if (call?.type === AST_NODE_TYPES.CallExpression && call.callee === outerOf(member)) {
    return URL_TEXTS.has(name) && call.arguments.length === 0;
  }
  return URL_PARTS.has(name) && !isAssignmentTarget(member);
}

function onlyPartsRead(sourceCode: SourceCode, node: TSESTree.NewExpression): boolean {
  if (isPartRead(node)) {
    return true;
  }
  const declarator = outerOf(node).parent;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.id.type !== AST_NODE_TYPES.Identifier ||
    declarator.parent.kind !== 'const'
  ) {
    return false;
  }
  const references = (variableNamed(sourceCode, declarator.id)?.references ?? []).filter(
    (reference) => !reference.init,
  );
  return references.length > 0 && references.every(({ identifier }) => isPartRead(identifier));
}

export function isConstantUrlRead(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    globalName({ sourceCode }, node.callee, 'URL') &&
    onlyPartsRead(sourceCode, node)
  );
}
