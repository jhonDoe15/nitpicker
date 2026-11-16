import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../security/security-values.mts';
import { isFillOnce } from '../support/flow/fill-once.mts';
import { callEffects, chainOuterCall, describePath, ioKind } from '../support/io-effects.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';
import { heldScope, isOnParameter, scopeLabel } from './held-scopes.mts';
import type { HeldScope, ScopeKind } from './scopes/scope-types.mts';

type Checked = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;

const REMOTE = 'remote';

function remotePath(context: Context, node: Checked): readonly string[] | undefined {
  const path = callEffects(node, context).get(REMOTE);
  const outer = chainOuterCall(node);
  const repeated = outer !== undefined && callEffects(outer, context).has(REMOTE);
  return repeated ? undefined : path;
}

export function remoteInScope(
  kind: ScopeKind,
  { needsDatabase }: { readonly needsDatabase: boolean },
): (context: Context) => TSESLint.RuleListener {
  return function create(context) {
    const proofs = new WeakMap<HeldScope, boolean>();
    const untyped = typeServices(context) === undefined;
    function provesConnection(scope: HeldScope): boolean {
      return cachedValue(proofs, scope, () =>
        scope.calls.some(
          (call) =>
            (untyped && isOnParameter(call, scope.param)) || ioKind(call, context) === 'database',
        ),
      );
    }
    function check(node: Checked): void {
      const scope = heldScope(kind, node, context);
      if (scope === undefined) {
        return;
      }
      const path = remotePath(context, node);
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
