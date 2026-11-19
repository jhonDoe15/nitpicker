import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nodeModule, FS_MODULES } from '../analysis/node/node-sync-modules.mts';
import {
  importedCalleeName,
  moduleBindings,
  type ModuleBindings,
} from '../analysis/subprocess-calls.mts';
import { constantInitializer, nameOf, type SourceCode } from '../typed/node-views.mts';
import { unwrapped } from './stream-sources.mts';

const STREAM_MODULES = new Set([
  ...FS_MODULES,
  ...nodeModule('stream'),
  ...nodeModule('zlib'),
  ...nodeModule('crypto'),
]);
const CREATORS = new Set<string>([
  'createReadStream',
  'createWriteStream',
  'createGzip',
  'createGunzip',
  'createDeflate',
  'createInflate',
  'createUnzip',
  'createBrotliCompress',
  'createBrotliDecompress',
  'createHash',
  'createHmac',
  'createCipheriv',
  'createDecipheriv',
]);
const CLASSES = new Set<string>(['Readable', 'Writable', 'Transform', 'PassThrough', 'Duplex']);
const MEMBER_CREATORS = new Set<string>(['createReadStream', 'createWriteStream', 'stream']);
const READABLE_FACTORIES = new Set<string>(['from', 'fromWeb']);
const LISTENERS = new Set<string>(['on', 'once', 'addListener', 'prependListener']);
const MAX_DEPTH = 3;
const COMPLETION_EVENTS = new Set<string>(['finish', 'end', 'close', 'error']);

export function streamBindings(program: TSESTree.Program): ModuleBindings {
  return moduleBindings(program, STREAM_MODULES);
}

function memberCall(
  call: TSESTree.CallExpression,
): { object: TSESTree.Expression; name: string } | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? { object: callee.object, name: nameOf(callee.property) ?? '' }
    : undefined;
}

export function listensForError(call: TSESTree.CallExpression): boolean {
  const member = memberCall(call);
  const [event] = call.arguments;
  return (
    member !== undefined &&
    LISTENERS.has(member.name) &&
    event?.type === AST_NODE_TYPES.Literal &&
    event.value === 'error'
  );
}

function createsStream(call: TSESTree.CallExpression, bindings: ModuleBindings): boolean {
  if (CREATORS.has(importedCalleeName(call.callee, bindings) ?? '')) {
    return true;
  }
  const member = memberCall(call);
  if (member === undefined) {
    return false;
  }
  const owner = nameOf(member.object) ?? '';
  return (
    MEMBER_CREATORS.has(member.name) ||
    (READABLE_FACTORIES.has(member.name) && (bindings.named.get(owner) ?? owner) === 'Readable')
  );
}

export type PipeEnv = { readonly sourceCode: SourceCode; readonly bindings: ModuleBindings };

type OriginStep = boolean | { readonly node: TSESTree.Node; readonly depth: number };

function originOfCall(env: PipeEnv, call: TSESTree.CallExpression, depth: number): OriginStep {
  const member = memberCall(call);
  if (member?.name === 'pipe') {
    const [target] = call.arguments;
    return target === undefined ? false : { node: target, depth };
  }
  if (member !== undefined && LISTENERS.has(member.name)) {
    return { node: member.object, depth };
  }
  return createsStream(call, env.bindings);
}

function originStep(env: PipeEnv, node: TSESTree.Node, depth: number): OriginStep {
  const current = unwrapped(node);
  if (current.type === AST_NODE_TYPES.NewExpression) {
    return CLASSES.has(env.bindings.named.get(nameOf(current.callee) ?? '') ?? '');
  }
  if (current.type === AST_NODE_TYPES.Identifier && depth < MAX_DEPTH) {
    const init = constantInitializer(env.sourceCode, current);
    return init === undefined ? false : { node: init, depth: depth + 1 };
  }
  return current.type === AST_NODE_TYPES.CallExpression ? originOfCall(env, current, depth) : false;
}

export function isStreamOrigin(env: PipeEnv, start: TSESTree.Node): boolean {
  const pending = [{ node: start, depth: 0 }];
  for (const { node, depth } of pending) {
    const step = originStep(env, node, depth);
    if (typeof step === 'boolean') {
      return step;
    }
    pending.push(step);
  }
  return false;
}

export function isPipe(node: TSESTree.Node): node is TSESTree.CallExpression {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    nameOf(node.callee.property) === 'pipe' &&
    node.arguments.length > 0
  );
}

export function pipeReceiver(call: TSESTree.CallExpression): TSESTree.Node {
  return call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : call.callee;
}

export function chainOfPipes(outer: TSESTree.CallExpression): TSESTree.CallExpression[] {
  const pipes = [outer];
  const receivers = [unwrapped(pipeReceiver(outer))];
  for (const receiver of receivers) {
    if (isPipe(receiver)) {
      pipes.unshift(receiver);
      receivers.push(unwrapped(pipeReceiver(receiver)));
    }
  }
  return pipes;
}

export function feedsPipe(call: TSESTree.CallExpression): boolean {
  const member = unwrapped(call).parent;
  return (
    member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === call &&
    isPipe(member.parent)
  );
}

export function resultUsed(call: TSESTree.CallExpression): boolean {
  const parent = call.parent;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === call) {
    const listener = parent.parent;
    const [event] = listener.type === AST_NODE_TYPES.CallExpression ? listener.arguments : [];
    return (
      LISTENERS.has(nameOf(parent.property) ?? '') &&
      event?.type === AST_NODE_TYPES.Literal &&
      COMPLETION_EVENTS.has(String(event.value))
    );
  }
  return (
    parent.type !== AST_NODE_TYPES.ExpressionStatement &&
    !isPipe(parent) &&
    parent.type !== AST_NODE_TYPES.ChainExpression
  );
}

export function receiverListens(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    const current = unwrapped(item);
    if (current.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    if (listensForError(current)) {
      return true;
    }
    if (current.callee.type === AST_NODE_TYPES.MemberExpression) {
      pending.push(current.callee.object);
    }
  }
  return false;
}

export function namedStreams(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  const current = unwrapped(node);
  return current.type === AST_NODE_TYPES.Identifier ||
    current.type === AST_NODE_TYPES.MemberExpression
    ? sourceCode.getText(current)
    : undefined;
}
