import { constantInitializer } from '../../analysis/ancestry.mjs';
import { moduleScope } from '../../database/orm-modules.mjs';
import { callsWithin } from '../../effects/held-scopes.mjs';
import { enclosingLoop, isRetryAttempt } from '../../loops/loop-shapes.mjs';
import { retryScope } from '../retry-scopes.mjs';
import { CONFLICT, isSave, staleEntity, unchangedEntity } from './stale-saves.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const ADVICE =
  'Retry the whole read-modify-write: re-read the row by id and re-apply the change inside the retried scope (`retry(async () => { const row = await repo.findOneByOrFail({ id }); row.status = next; return repo.save(row); })`).';
const EXCEPTION = 'An exception fits only when the retry is not meant for a version conflict.';

function initializerText(sourceCode, node) {
  const built = node?.type === 'Identifier' ? constantInitializer(sourceCode, node) : undefined;
  return built === undefined ? '' : sourceCode.getText(built);
}

function retryText(context, call) {
  const { sourceCode } = context;
  const policy = call.callee.type === 'MemberExpression' ? call.callee.object : undefined;
  const named = [policy, ...call.arguments].map((node) => initializerText(sourceCode, node));
  return [sourceCode.getText(call), ...named].join(' ');
}

function check(context, call, region) {
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

function checkWrapper(context, scope, { node, retried }) {
  if (!(FUNCTIONS.has(retried?.type) && retryText(context, node).includes(CONFLICT))) {
    return;
  }
  const keys = context.sourceCode.visitorKeys;
  for (const call of callsWithin(retried.body, keys).filter((each) =>
    isSave(each, context, scope),
  )) {
    check(context, call, retried);
  }
}

function checkLoop(context, scope, call) {
  const found = isSave(call, context, scope) ? enclosingLoop(call, context) : undefined;
  const retrying =
    found?.loop !== undefined && isRetryAttempt(call, found.loop, context.sourceCode.visitorKeys);
  if (retrying && context.sourceCode.getText(found.loop).includes(CONFLICT)) {
    check(context, call, found.loop);
  }
}

export const rule = {
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
