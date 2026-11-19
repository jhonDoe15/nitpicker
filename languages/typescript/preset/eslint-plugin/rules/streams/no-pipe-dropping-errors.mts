import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../typed/node-views.mts';
import {
  chainOfPipes,
  feedsPipe,
  isPipe,
  isStreamOrigin,
  listensForError,
  namedStreams,
  pipeReceiver,
  receiverListens,
  resultUsed,
  streamBindings,
  type PipeEnv,
} from './pipe-origins.mts';
import { unwrapped } from './stream-sources.mts';

const PIPELINES = new Set<string>(['pipeline', 'finished']);
const FINISH_EVENTS = new Set<string>(['finish', 'end', 'close']);

type Facts = { readonly handled: Set<string>; readonly completed: Set<string> };

function listenedEvent(call: TSESTree.CallExpression): string | undefined {
  const [event] = call.arguments;
  const { callee } = call;
  const listener =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    ['on', 'once'].includes(nameOf(callee.property) ?? '');
  return listener && event?.type === AST_NODE_TYPES.Literal ? String(event.value) : undefined;
}

function recordCall(sourceCode: SourceCode, call: TSESTree.CallExpression, facts: Facts): void {
  const callee = unwrapped(call.callee);
  const owner = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  const ownerName = owner === undefined ? undefined : namedStreams(sourceCode, owner);
  if (ownerName !== undefined && listensForError(call)) {
    facts.handled.add(ownerName);
  }
  if (ownerName !== undefined && FINISH_EVENTS.has(listenedEvent(call) ?? '')) {
    facts.completed.add(ownerName);
  }
  const name = nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
  const piped = PIPELINES.has(name ?? '') ? call.arguments : [];
  for (const argument of piped) {
    const text = namedStreams(sourceCode, argument);
    if (text !== undefined) {
      facts.handled.add(text);
    }
  }
}

function dropsErrors(env: PipeEnv, facts: Facts, outer: TSESTree.CallExpression): boolean {
  const pipes = chainOfPipes(outer);
  const [first] = pipes;
  const root = first === undefined ? undefined : pipeReceiver(first);
  const middles = pipes.slice(0, -1).flatMap((each) => each.arguments[0] ?? []);
  function unhandled(stream: TSESTree.Node): boolean {
    const name = namedStreams(env.sourceCode, stream);
    return !receiverListens(stream) && (name === undefined || !facts.handled.has(name));
  }
  const target = pipes.length === 1 ? outer.arguments[0] : undefined;
  const awaited =
    target !== undefined && facts.completed.has(namedStreams(env.sourceCode, target) ?? '');
  const lost =
    (root !== undefined && isStreamOrigin(env, root) && [root, ...middles].some(unhandled)) ||
    middles.some((stream) => isStreamOrigin(env, stream) && unhandled(stream));
  return lost && (pipes.length > 1 || resultUsed(outer) || awaited);
}

export const rule: TSESLint.RuleModule<'dropsErrors'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow .pipe() chains that drop the errors of the earlier streams' },
    schema: [],
    messages: {
      dropsErrors:
        "`.pipe()` does not forward errors or destroy the other streams, so a failure of the source or of a middle stream is never reported, the awaiting code never settles and descriptors stay open. Use `pipeline(a, b, c)` from 'node:stream/promises' (or 'node:stream' with a callback), or listen for 'error' on every stream before the last. An exception fits only a CLI entry point where the default crash is intended.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const env = { sourceCode, bindings: streamBindings(sourceCode.ast) };
    const facts: Facts = { handled: new Set<string>(), completed: new Set<string>() };
    const chains: TSESTree.CallExpression[] = [];

    return {
      CallExpression(call: TSESTree.CallExpression) {
        recordCall(sourceCode, call, facts);
        if (isPipe(call) && !feedsPipe(call)) {
          chains.push(call);
        }
      },
      'Program:exit'() {
        for (const outer of chains.filter((chain) => dropsErrors(env, facts, chain))) {
          context.report({ node: outer, messageId: 'dropsErrors' });
        }
      },
    };
  },
};
