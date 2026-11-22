import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  unwrapped,
} from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { loopBodyNodes, type WorklistLoop } from './worklist-loops.mts';

const VISITED_PROPERTIES = new Set(['visited', 'seen', 'marked']);
const VISITED_COLLECTION_NAMES = /^(?:visited|seen|marked|expanded|done|memo|checked|processed)/iu;
const SYNTAX_TREE_CALLS = new Set([
  'getChildren',
  'forEachChild',
  'getChildAt',
  'nodeChildren',
  'codeChildren',
  'objectChildren',
]);
const SYNTAX_TREE_PROPERTIES = new Set(['children', 'childNodes']);
const SYNTAX_TREE_IDENTIFIERS = new Set(['visitorKeys', 'SyntaxKind', 'AST_NODE_TYPES']);
const SYNTAX_TREE_TYPE_PATTERN = /\b(?:ts\.Node|TSESTree\.|ESTree\.|SyntaxNode|ASTNode)\b/u;

function isAssignmentTarget(node: TSESTree.Node): boolean {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node;
}

function isHasCheck(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const member = calledMember(node);
  return member !== undefined && memberName(member) === 'has';
}

function isVisitedGetCheck(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const member = calledMember(node);
  if (member === undefined || memberName(member) !== 'get') {
    return false;
  }
  const receiver = unwrapped(member.object);
  return (
    receiver.type === AST_NODE_TYPES.Identifier && VISITED_COLLECTION_NAMES.test(receiver.name)
  );
}

function isVisitedMemberCheck(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || isAssignmentTarget(node)) {
    return false;
  }
  if (!node.computed) {
    const property = memberName(node);
    return property !== undefined && VISITED_PROPERTIES.has(property);
  }
  const receiver = unwrapped(node.object);
  return (
    receiver.type === AST_NODE_TYPES.Identifier && VISITED_COLLECTION_NAMES.test(receiver.name)
  );
}

function isVisitedInCheck(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.BinaryExpression || node.operator !== 'in') {
    return false;
  }
  const right = unwrapped(node.right);
  return right.type === AST_NODE_TYPES.Identifier && VISITED_COLLECTION_NAMES.test(right.name);
}

function isVisitedCheckNode(node: TSESTree.Node): boolean {
  return (
    isHasCheck(node) ||
    isVisitedGetCheck(node) ||
    isVisitedMemberCheck(node) ||
    isVisitedInCheck(node)
  );
}

export function hasVisitedCheck(worklist: WorklistLoop): boolean {
  const lastAppendStart = Math.max(...worklist.appends.map((append) => append.range[0]));
  return loopBodyNodes(worklist.loop).some(
    (node) => node.range[0] < lastAppendStart && isVisitedCheckNode(node),
  );
}

function isSyntaxTreeNode(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return SYNTAX_TREE_IDENTIFIERS.has(node.name);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const name = memberName(node);
    return (
      name !== undefined && (SYNTAX_TREE_PROPERTIES.has(name) || SYNTAX_TREE_IDENTIFIERS.has(name))
    );
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return SYNTAX_TREE_CALLS.has(callee.name);
  }
  const member = calledMember(node);
  const method = member === undefined ? undefined : memberName(member);
  return method !== undefined && SYNTAX_TREE_CALLS.has(method);
}

function worklistIdentifier(worklist: WorklistLoop): TSESTree.Identifier | undefined {
  const [first] = worklist.appends;
  const member = first === undefined ? undefined : calledMember(first);
  const receiver = member === undefined ? undefined : unwrapped(member.object);
  return receiver?.type === AST_NODE_TYPES.Identifier ? receiver : undefined;
}

function hasSyntaxTreeType(worklist: WorklistLoop, sourceCode: SourceCode): boolean {
  const identifier = worklistIdentifier(worklist);
  const definition =
    identifier === undefined ? undefined : variableNamed(sourceCode, identifier)?.defs[0];
  if (definition === undefined) {
    return false;
  }
  const text = sourceCode.getText(definition.node);
  return SYNTAX_TREE_TYPE_PATTERN.test(text);
}

export function isSyntaxTreeWorklist(worklist: WorklistLoop, sourceCode: SourceCode): boolean {
  return (
    hasSyntaxTreeType(worklist, sourceCode) || loopBodyNodes(worklist.loop).some(isSyntaxTreeNode)
  );
}
