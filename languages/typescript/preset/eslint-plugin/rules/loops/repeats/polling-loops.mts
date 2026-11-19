import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { estreeCallView } from '../../support/io/call-views.mts';
import { ancestorsOf, chainOf, contains, nameOf } from '../../typed/node-views.mts';
import { calleeName } from '../../typed/syntax-views.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import type { Call } from '../builders/chain-execution.mts';
import {
  descendants,
  enclosingLoop,
  isTestedLoop,
  type EnclosingLoop,
  type LoopNode,
  type VisitorKeys,
} from '../loop-shapes.mts';
import { bodyDeclaredNames, isConsumingCall, itemNames, referencedNames } from './loop-names.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;

const WAITS = new Set(['sleep', 'delay', 'wait', 'settimeout', 'backoff', 'pause', 'waitfor']);
const DEADLINE_WORDS = new Set(['deadline', 'timeout', 'expires', 'expiry', 'elapsed']);
const CLOCKS = new Set(['now']);

function intoFunctions(): boolean {
  return false;
}

function isWait(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression && WAITS.has(calleeName(node.callee).toLowerCase())
  );
}

function isDeadlineCheck(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return wordsOf(node.name).some((word) => DEADLINE_WORDS.has(word.toLowerCase()));
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    CLOCKS.has(nameOf(node.callee.property) ?? '') &&
    ['Date', 'performance'].includes(nameOf(node.callee.object) ?? '')
  );
}

function pacesItself(loop: LoopNode, visitorKeys: VisitorKeys): boolean {
  const roots = 'test' in loop && loop.test !== null ? [loop.body, loop.test] : [loop.body];
  return roots.some((root) =>
    descendants(root, visitorKeys, intoFunctions).some(
      (node) => isWait(node) || isDeadlineCheck(node),
    ),
  );
}

function outerNames(loop: LoopNode, context: Context): string[] {
  const outer = chainOf<EnclosingLoop>(enclosingLoop(loop, context), (found) =>
    enclosingLoop(found.callback ?? found.loop, context),
  );
  return outer.flatMap((found) => [...itemNames(found, context.sourceCode.visitorKeys)]);
}

function usesIterationState(call: Call, loop: LoopNode, context: Context): boolean {
  const { visitorKeys } = context.sourceCode;
  const args = call.type === AST_NODE_TYPES.CallExpression ? call.arguments : [];
  const bound = new Set([
    ...bodyDeclaredNames(loop, visitorKeys),
    ...itemNames({ loop, child: loop.body }, visitorKeys),
    ...outerNames(loop, context),
  ]);
  return args.some(
    (argument) =>
      descendants(argument, visitorKeys, intoFunctions).some(isConsumingCall) ||
      [...referencedNames(argument, visitorKeys)].some((name) => bound.has(name)),
  );
}

export function isPollingCall(call: Call, loop: LoopNode | undefined, context: Context): boolean {
  if (!isTestedLoop(loop)) {
    return false;
  }
  const { visitorKeys } = context.sourceCode;
  return pacesItself(loop, visitorKeys) && !usesIterationState(call, loop, context);
}

function ownerOf(call: Call, context: Context): string {
  return estreeCallView(call, context).names.slice(0, -1).join('.');
}

function catchingTry(call: Call, loop: LoopNode): TSESTree.TryStatement | undefined {
  const within = ancestorsOf(call).filter((ancestor) => contains(loop, ancestor));
  const handler = within.find((ancestor) => ancestor.type === AST_NODE_TYPES.CatchClause);
  const attempt = handler?.parent;
  return attempt?.type === AST_NODE_TYPES.TryStatement ? attempt : undefined;
}

export function isRereadInCatch(call: Call, loop: LoopNode | undefined, context: Context): boolean {
  const attempt = loop === undefined ? undefined : catchingTry(call, loop);
  const owner = ownerOf(call, context);
  if (attempt === undefined || owner === '') {
    return false;
  }
  return descendants(attempt.block, context.sourceCode.visitorKeys, intoFunctions).some(
    (node) =>
      (node.type === AST_NODE_TYPES.CallExpression ||
        node.type === AST_NODE_TYPES.TaggedTemplateExpression) &&
      ownerOf(node, context) === owner,
  );
}
