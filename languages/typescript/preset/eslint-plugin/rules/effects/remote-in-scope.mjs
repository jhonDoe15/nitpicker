import { callEffects, chainOuterCall, describePath, ioKind } from '../support/io-effects.mjs';
import { heldScope, isOnParameter, scopeLabel } from './held-scopes.mjs';

const REMOTE = 'remote';

function provesConnection(context, scope) {
  return scope.calls.some(
    (call) => isOnParameter(call, scope.param) || ioKind(call, context) === 'database',
  );
}

function remotePath(context, node) {
  const path = callEffects(node, context).get(REMOTE);
  const outer = chainOuterCall(node);
  const repeated = outer !== undefined && callEffects(outer, context).has(REMOTE);
  return repeated ? undefined : path;
}

export function remoteInScope(kind, needsDatabase) {
  return function create(context) {
    const functionCalls = new Map();
    function check(node) {
      const scope = heldScope(kind, node, { sourceCode: context.sourceCode, functionCalls });
      const path = scope === undefined ? undefined : remotePath(context, node);
      if (path === undefined || (needsDatabase && !provesConnection(context, scope))) {
        return;
      }
      context.report({
        node,
        messageId: kind,
        data: { callee: describePath(path), scope: scopeLabel(scope) },
      });
    }
    return { CallExpression: check, TaggedTemplateExpression: check };
  };
}
