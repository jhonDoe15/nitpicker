import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { moduleScope, type ModuleScope } from '../../database/orm-modules.mts';
import { callsWithin } from '../../effects/held-scopes.mts';
import { enclosingLoop, isRetryAttempt } from '../../loops/loop-shapes.mts';
import type { Context } from '../../security/security-values.mts';
import { constantInitializer, type SourceCode } from '../../typed/node-views.mts';
import { isCallback } from '../../typed/syntax-views.mts';
import { retryScope, type RetryScope } from '../retry-scopes.mts';
import { CONFLICT, isSave, staleEntity, unchangedEntity } from './stale-saves.mts';

const ADVICE =
  'Retry the whole read-modify-write: re-read the row by id and re-apply the change inside the retried scope (`retry(async () => { const row = await repo.findOneByOrFail({ id }); row.status = next; return repo.save(row); })`).';
const EXCEPTION = 'An exception fits only when the retry is not meant for a version conflict.';

function initializerText(sourceCode: SourceCode, node: TSESTree.Node | undefined): string {
  const built =
    node?.type === AST_NODE_TYPES.Identifier ? constantInitializer(sourceCode, node) : undefined;
  return built === undefined ? '' : sourceCode.getText(built);
}

function retryText(context: Context, call: TSESTree.CallExpression): string {
  const { sourceCode } = context;
  const policy =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : undefined;
  const named = [policy, ...call.arguments].map((node) => initializerText(sourceCode, node));
  return [sourceCode.getText(call), ...named].join(' ');
}

function check(context: Context, call: TSESTree.CallExpression, region: TSESTree.Node): void {
  const stale = staleEntity(context, call, region);
  if (stale !== undefined) {
    context.report({ node: call, messageId: 'stale', data: { entity: stale } });
    return;
  }
  const lost = unchangedEntity(context, call, region);
  if (lost !== undefined) {
    context.report({ node: call, messageId: 'lost', data: { entity: lost } });
  }
}

function checkWrapper(
  context: Context,
  scope: ModuleScope,
  { node, retried }: { node: TSESTree.CallExpression; retried: RetryScope['retried'] },
): void {
  if (!(isCallback(retried) && retryText(context, node).includes(CONFLICT))) {
    return;
  }
  const keys = context.sourceCode.visitorKeys;
  for (const call of callsWithin(retried.body, keys)) {
    if (call.type === AST_NODE_TYPES.CallExpression && isSave(call, context, scope)) {
      check(context, call, retried);
    }
  }
}

function checkLoop(context: Context, scope: ModuleScope, call: TSESTree.CallExpression): void {
  const found = isSave(call, context, scope) ? enclosingLoop(call, context) : undefined;
  if (found?.loop === undefined) {
    return;
  }
  const retrying = isRetryAttempt(call, found.loop, context.sourceCode.visitorKeys);
  if (retrying && context.sourceCode.getText(found.loop).includes(CONFLICT)) {
    check(context, call, found.loop);
  }
}

export const rule: TSESLint.RuleModule<
  'stale' | 'lost',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not retry an optimistic-lock conflict with a stale or unchanged entity',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      stale: `This retry after an optimistic-lock conflict saves \`{{entity}}\`, which was loaded before the retried scope and carries the old version: every attempt fails the same way. ${ADVICE} ${EXCEPTION}`,
      lost: `This retry after an optimistic-lock conflict saves \`{{entity}}\` as it was re-read, without re-applying the change: the update is lost. ${ADVICE} ${EXCEPTION}`,
    },
  },
  create(context) {
    const scope = moduleScope(context);
    if (!scope.families.has('typeorm')) {
      return {};
    }
    return {
      CallExpression(node) {
        const retry = retryScope(node, context);
        if (retry !== undefined) {
          checkWrapper(context, scope, { node, retried: retry.retried });
        } else {
          checkLoop(context, scope, node);
        }
      },
    };
  },
};
