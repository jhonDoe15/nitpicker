import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { isThenable } from '../../promises/cannot-reject.mjs';
import { isFunctionNode } from '../scope/close-scopes.mjs';
import { cacheBinding, checksIdentity, isGuarded, rejectionClears } from './cache-bindings.mjs';

const EXCEPTION =
  ' An exception fits only when keeping the first failure is intended (a startup-only cache).';
const SAFE_FORM =
  'const attempt = start(); {{name}} = attempt; try { return await attempt; } catch (error) { if ({{name}} === attempt) { {{name}} = undefined; } throw error; }';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a cached promise to be cleared when its attempt rejects, and only if it still holds that attempt',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      kept: `{{name}} caches a promise and returns it on later calls, but nothing clears it when the attempt rejects, so every later call replays the first failure instead of trying again. Clear it in a catch, only while it still holds this attempt: \`${SAFE_FORM}\`.${EXCEPTION}`,
      stale: `{{name}} is cleared after a rejection without checking that it still holds the failed attempt, so a late failure of an old attempt wipes the newer attempt. Keep the attempt in a variable and clear only if it matches: \`if ({{name}} === attempt) { {{name}} = undefined; }\`.${EXCEPTION}`,
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const checker = services.program.getTypeChecker();

    return {
      AssignmentExpression(assignment) {
        const binding = cacheBinding(sourceCode, assignment);
        const fn = ancestorsOf(assignment).find(isFunctionNode);
        if (
          binding === undefined ||
          fn === undefined ||
          !isThenable(checker, services.esTreeNodeToTSNodeMap.get(assignment.right)) ||
          !isGuarded({ sourceCode, binding, fn }, assignment)
        ) {
          return;
        }
        const clears = rejectionClears(sourceCode, fn, binding);
        const data = { name: binding.text };
        if (clears.length === 0) {
          context.report({ node: assignment, messageId: 'kept', data });
        } else if (!clears.some((clear) => checksIdentity(sourceCode, clear, binding))) {
          context.report({ node: clears[0], messageId: 'stale', data });
        }
      },
    };
  },
};
