import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { isFunctionNode } from '../../analysis/constant-resolution.mjs';
import { partsOf } from '../../analysis/narrowing/type-parts.mjs';
import { memberName } from '../../analysis/test-code-analysis.mjs';
import { typeServices } from '../../security/security-values.mjs';
import {
  LISTENERS,
  isFunctionExpression,
  nodesInside,
  promiseExecutor,
  shortText,
} from './executor-sources.mjs';

const NETWORK_TYPES = new Set([
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

function lastName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'MemberExpression' ? memberName(node) : undefined;
}

function typeNames(checker, type) {
  const names = [];
  const pending = [...partsOf(type)];
  for (const part of pending) {
    names.push(part.getSymbol()?.getName());
    if (part.isClassOrInterface()) {
      pending.push(...(checker.getBaseTypes(part) ?? []));
    }
  }
  return names;
}

function emitterOf(call) {
  const receiver = call.callee.object;
  return receiver.type === 'CallExpression' &&
    receiver.callee.type === 'MemberExpression' &&
    LISTENERS.has(memberName(receiver.callee))
    ? emitterOf(receiver)
    : receiver;
}

function isNetwork(services, receiver) {
  if (services !== undefined) {
    const checker = services.program.getTypeChecker();
    const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(receiver));
    if ((type.flags & ts.TypeFlags.Any) === 0) {
      return typeNames(checker, type).some((name) => NETWORK_TYPES.has(name));
    }
  }
  return NETWORK_NAME.test(lastName(receiver) ?? '');
}

function listenerOf(listeners, identifier) {
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

function hasDeadline(context, construction) {
  const scope = ancestorsOf(construction).find(isFunctionNode) ?? context.sourceCode.ast;
  return nodesInside(context, scope, { nested: true }).some(
    (node) =>
      (node.type === 'Identifier' && DEADLINE_NAME.test(node.name)) ||
      (node.type === 'Literal' && node.value === 'timeout'),
  );
}

const MESSAGE =
  "This promise settles only from events on `{{receiver}}`, a network stream or socket, and nothing bounds the wait: a peer that stops sending keeps it pending forever. Add a deadline: a timer that rejects, `AbortSignal.timeout(ms)` passed as `signal`, or the socket's `setTimeout` with a `'timeout'` listener that destroys it. This is a design note for review and does not fail the change.";

function waitedListeners({ settlers, sources }) {
  const listeners = sources.filter(({ kind }) => kind === 'listener');
  const settles = settlers.flatMap((variable) => variable.references.map((ref) => ref.identifier));
  const used = settles.map((identifier) => listenerOf(listeners, identifier));
  return settles.length === 0 || used.includes(undefined) ? [] : used;
}

export const rule = {
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
      NewExpression(construction) {
        const found = promiseExecutor(context, construction);
        if (found === undefined || !found.rejects) {
          return;
        }
        const used = waitedListeners(found);
        if (
          used.length === 0 ||
          !used.every(({ call }) => isNetwork(services, emitterOf(call))) ||
          hasDeadline(context, construction)
        ) {
          return;
        }
        context.report({
          node: used[0].call,
          messageId: 'noDeadline',
          data: { receiver: shortText(context, emitterOf(used[0].call)) },
        });
      },
    };
  },
};
