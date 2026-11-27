import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isCallback, unwrapped, type Callback } from '../../typed/syntax-views.mts';
import { textOf } from '../../../../../../../shared/values/readers.mts';
import { isFsCall } from '../repeated-calls/call-shapes.mts';
import { innermostRepeat } from '../support/loop-invariance.mts';

const LISTINGS = new Set(['readdir', 'readdirSync']);
const ENTRY_METHODS = new Set(['filter', 'flatMap', 'forEach', 'map', 'some', 'every', 'find']);

export function calledName(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : memberName(callee);
}

function isNameListing(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  const call = value.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(value.argument) : value;
  if (call.type !== AST_NODE_TYPES.CallExpression || call.arguments.length > 2) {
    return false;
  }
  const options = call.arguments[1];
  return (
    LISTINGS.has(calledName(call.callee) ?? '') &&
    isFsCall(sourceCode, call.callee) &&
    (options === undefined || options.type === AST_NODE_TYPES.Literal)
  );
}

function isListing(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return isNameListing(sourceCode, value);
  }
  const variable = variableNamed(sourceCode, value);
  const definition = variable?.defs[0];
  return (
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator &&
    definition.node.parent.kind === 'const' &&
    definition.node.init !== null &&
    isNameListing(sourceCode, definition.node.init)
  );
}

function listsEntries(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const member = calledMember(call);
  return (
    member !== undefined &&
    ENTRY_METHODS.has(textOf(memberName(member))) &&
    isListing(sourceCode, member.object)
  );
}

function callbackEntry(sourceCode: SourceCode, fn: Callback): TSESTree.Identifier | undefined {
  const call = fn.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== fn) {
    return undefined;
  }
  const [entry] = fn.params;
  return listsEntries(sourceCode, call) && entry?.type === AST_NODE_TYPES.Identifier
    ? entry
    : undefined;
}

function loopEntry(sourceCode: SourceCode, loop: TSESTree.Node): TSESTree.Identifier | undefined {
  if (loop.type !== AST_NODE_TYPES.ForOfStatement || !isListing(sourceCode, loop.right)) {
    return undefined;
  }
  const { left } = loop;
  const [declarator] = left.type === AST_NODE_TYPES.VariableDeclaration ? left.declarations : [];
  return declarator?.id.type === AST_NODE_TYPES.Identifier ? declarator.id : undefined;
}

export function listedEntry(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESTree.Identifier | undefined {
  const repeat = innermostRepeat(node);
  if (repeat === undefined) {
    return undefined;
  }
  return isCallback(repeat.node)
    ? callbackEntry(sourceCode, repeat.node)
    : loopEntry(sourceCode, repeat.node);
}
