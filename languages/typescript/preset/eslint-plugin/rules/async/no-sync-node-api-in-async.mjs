import { bindingsOf, importedFunction } from '../security/imported-names.mjs';
import { enclosingContext, isStartupFunction, routeHandlers } from './async-contexts.mjs';
import { FRAMEWORK_MODULES, SYNC_FAMILIES, WORKER_MODULES } from './sync-node-apis.mjs';

const WORKER_MODULE_NAMES = new Set(WORKER_MODULES);
const FRAMEWORK_MODULE_NAMES = new Set(FRAMEWORK_MODULES);
const WORKER_BINDINGS = new Set(['parentPort', 'workerData', 'isMainThread']);
const WORKER_MEMBER = /\.(?:parentPort|workerData|isMainThread)\b/u;
const NEST_MODULES = new Set(['@nestjs/common']);
const CONTEXT_NAMES = { async: 'an async function', handler: 'a request handler' };

function isWorkerFile(program, text) {
  const bindings = bindingsOf(program, WORKER_MODULE_NAMES);
  const named = [...bindings.named.values()].some((name) => WORKER_BINDINGS.has(name));
  return named || (bindings.namespaces.size > 0 && WORKER_MEMBER.test(text));
}

function hasBindings(bindings) {
  return bindings.named.size > 0 || bindings.namespaces.size > 0;
}

function syncCall(context, families, call) {
  for (const { family, bindings } of families) {
    const name = importedFunction(context, call.callee, bindings);
    if (name !== undefined && family.matches(name)) {
      return { name, family };
    }
  }
  return undefined;
}

function fileScope(program, text) {
  if (isWorkerFile(program, text) || text.startsWith('#!')) {
    return undefined;
  }
  return {
    families: SYNC_FAMILIES.map((family) => ({
      family,
      bindings: bindingsOf(program, family.modules),
    })),
    frameworks: hasBindings(bindingsOf(program, FRAMEWORK_MODULE_NAMES)),
    nestBindings: bindingsOf(program, NEST_MODULES),
  };
}

function reportCandidates(context, { candidates, calls, scope }) {
  const handlers = routeHandlers(context, calls, scope.frameworks);
  for (const { node, name, family } of candidates) {
    const found = enclosingContext(node, { handlers, nestBindings: scope.nestBindings });
    if (found === undefined || (found.kind === 'async' && isStartupFunction(context, found.fn))) {
      continue;
    }
    context.report({
      node,
      messageId: 'blocking',
      data: { api: name, context: CONTEXT_NAMES[found.kind], alternative: family.alternative },
    });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow synchronous Node APIs inside async functions and request handlers',
    },
    schema: [],
    messages: {
      blocking:
        '`{{api}}` blocks the event loop inside {{context}}, so every other request and task waits until it finishes. Use {{alternative}}, or move the work to a worker thread. Module top level, a CLI main that nothing else calls and worker threads are not checked. An exception fits only for a bounded read that must finish before the function can continue.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const calls = [];
    const candidates = [];
    let scope;

    return {
      Program(program) {
        scope = fileScope(program, sourceCode.text);
      },
      CallExpression(node) {
        if (scope === undefined) {
          return;
        }
        calls.push(node);
        const found = syncCall(context, scope.families, node);
        if (found !== undefined) {
          candidates.push({ node, ...found });
        }
      },
      'Program:exit'() {
        if (scope !== undefined && candidates.length > 0) {
          reportCandidates(context, { candidates, calls, scope });
        }
      },
    };
  },
};
