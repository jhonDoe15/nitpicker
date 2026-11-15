import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ancestorsOf, type Ranged, type SourceCode } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { partsOf } from '../../analysis/narrowing/type-parts.mts';
import { memberName } from '../../analysis/test-code-analysis.mts';
import { typeServices } from '../../security/security-values.mts';
import {
  isFunctionExpression,
  isListenerCall,
  nodesInside,
  promiseExecutor,
  shortText,
  type ExecutorSource,
  type PromiseExecutor,
} from './executor-sources.mts';

type Services = ParserServicesWithTypeInformation | undefined;
type Context = { readonly sourceCode: SourceCode };
type ListenerUse = Extract<ExecutorSource, { readonly kind: 'listener' }>;

const NETWORK_TYPES = new Set<string>([
  'Socket',
  'TLSSocket',
  'IncomingMessage',
  'ClientRequest',
  'WebSocket',
  'Http2Stream',
  'ClientHttp2Stream',
  'ServerHttp2Stream',
  'ClientHttp2Session',
]);
const NETWORK_NAME =
  /^(?:socket|sock|tlsSocket|ws|webSocket|websocket|conn|connection|req|request|res|response|upstream)$/u;
const DEADLINE_NAME = /signal|timeout|deadline|^race$/iu;

function lastName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.MemberExpression ? memberName(node) : undefined;
}

function typeNames(checker: TypeScript.TypeChecker, type: TypeScript.Type): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  const pending = [...partsOf(type)];
  for (const part of pending) {
    names.push(part.getSymbol()?.getName());
    if (part.isClassOrInterface()) {
      pending.push(...checker.getBaseTypes(part));
    }
  }
  return names;
}

function emitterOf(call: ListenerUse['call']): TSESTree.Node {
  const chain: TSESTree.Node[] = [call.callee.object];
  for (const receiver of chain) {
    if (isListenerCall(receiver)) {
      chain.push(receiver.callee.object);
    }
  }
  return chain.at(-1) ?? call.callee.object;
}

function isNetwork(services: Services, receiver: TSESTree.Node): boolean {
  if (services !== undefined) {
    const checker = services.program.getTypeChecker();
    const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(receiver));
    if ((type.flags & ts.TypeFlags.Any) === 0) {
      return typeNames(checker, type).some((name) => NETWORK_TYPES.has(name ?? ''));
    }
  }
  return NETWORK_NAME.test(lastName(receiver) ?? '');
}

function listenerOf(
  listeners: readonly ListenerUse[],
  identifier: Ranged,
): ListenerUse | undefined {
  return listeners.find(({ call }) =>
    call.arguments.some(
      (argument) =>
        argument === identifier ||
        (isFunctionExpression(argument) &&
          identifier.range[0] >= argument.range[0] &&
          identifier.range[1] <= argument.range[1]),
    ),
  );
}

function hasDeadline(context: Context, construction: TSESTree.NewExpression): boolean {
  const scope = ancestorsOf(construction).find(isFunctionNode) ?? context.sourceCode.ast;
  return nodesInside(context, scope, { nested: true }).some(
    (node) =>
      (node.type === AST_NODE_TYPES.Identifier && DEADLINE_NAME.test(node.name)) ||
      (node.type === AST_NODE_TYPES.Literal && node.value === 'timeout'),
  );
}

const MESSAGE =
  "Add a deadline to this wait, such as a timer that rejects, `AbortSignal.timeout(ms)` passed as `signal`, or the socket's `setTimeout` with a `'timeout'` listener that destroys it: the promise settles only from events on `{{receiver}}`, a network stream or socket, so a peer that stops sending keeps it pending forever. This is a design note for review and does not fail the change.";

function waitedListeners({ settlers, sources }: PromiseExecutor): readonly ListenerUse[] {
  const listeners = sources.filter((source) => source.kind === 'listener');
  const settles = settlers.flatMap((variable) => variable.references.map((ref) => ref.identifier));
  const used = settles.map((identifier) => listenerOf(listeners, identifier));
  const waited = used.filter((listener) => listener !== undefined);
  return settles.length === 0 || waited.length < used.length ? [] : waited;
}

export const rule: TSESLint.RuleModule<'noDeadline'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Report a `new Promise` that waits only on network stream or socket events with no deadline',
    },
    schema: [],
    messages: { noDeadline: MESSAGE },
  },
  create(context) {
    const services = typeServices(context);
    return {
      NewExpression(construction: TSESTree.NewExpression) {
        const found = promiseExecutor(context, construction);
        if (found === undefined || !found.rejects) {
          return;
        }
        const used = waitedListeners(found);
        const [first] = used;
        if (
          first === undefined ||
          !used.every(({ call }) => isNetwork(services, emitterOf(call))) ||
          hasDeadline(context, construction)
        ) {
          return;
        }
        context.report({
          node: first.call,
          messageId: 'noDeadline',
          data: { receiver: shortText(context, emitterOf(first.call)) },
        });
      },
    };
  },
};
