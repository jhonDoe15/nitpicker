import { typeServices } from '../security/security-values.mjs';
import { isFillOnce } from '../support/flow/fill-once.mjs';
import { callEffects, chainOuterCall, describePath, ioKind } from '../support/io-effects.mjs';
import { memoized } from '../support/memo.mjs';
import { heldScope, isOnParameter, scopeLabel } from './held-scopes.mjs';

const REMOTE = 'remote';

function remotePath(context, node) {
  const path = callEffects(node, context).get(REMOTE);
  const outer = chainOuterCall(node);
  const repeated = outer !== undefined && callEffects(outer, context).has(REMOTE);
  return repeated ? undefined : path;
}

export function remoteInScope(kind, needsDatabase) {
  return function create(context) {
    const proofs = new WeakMap();
    const untyped = typeServices(context) === undefined;
    function provesConnection(scope) {
      return memoized(proofs, scope, () =>
        scope.calls.some(
          (call) =>
            (untyped && isOnParameter(call, scope.param)) || ioKind(call, context) === 'database',
        ),
      );
    }
    function check(node) {
      const scope = heldScope(kind, node, context);
      const path = scope === undefined ? undefined : remotePath(context, node);
      if (path === undefined || (needsDatabase && !provesConnection(scope))) {
        return;
      }
      if (!needsDatabase && isFillOnce(node, scope.root, context.sourceCode)) {
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
