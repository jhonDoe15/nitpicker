import { findVariable } from '../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction, isModuleValue } from '../security/imported-names.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import {
  enclosingContext,
  frameworkNames,
  isStartupFunction,
  isWorkerBranch,
  routeHandlers,
} from './async-contexts.mjs';
import { FRAMEWORK_MODULES, SYNC_FAMILIES, WORKER_MODULES } from './sync-node-apis.mjs';

const WORKER_MODULE_NAMES = new Set(WORKER_MODULES);
const FRAMEWORK_MODULE_NAMES = new Set(FRAMEWORK_MODULES);
const WORKER_SCRIPT_BINDINGS = new Set(['parentPort', 'workerData']);
const WORKER_SCRIPT_MEMBER = /\.(?:parentPort|workerData)\b/u;
const NEST_MODULES = new Set(['@nestjs/common']);
const CONTEXT_NAMES = { async: 'an async function', handler: 'a request handler' };
const MODULE_SCOPES = new Set(['module', 'global']);

function isWorkerScript(bindings, text) {
  const named = [...bindings.named.values()].some((name) => WORKER_SCRIPT_BINDINGS.has(name));
  return named || (bindings.namespaces.size > 0 && WORKER_SCRIPT_MEMBER.test(text));
}

function rootIdentifier(node) {
  const target = unwrapped(node);
  if (target?.type === 'MemberExpression') {
    return rootIdentifier(target.object);
  }
  return target?.type === 'Identifier' ? target : undefined;
}

function isShadowed(context, callee) {
  const root = rootIdentifier(callee);
  const variable = root === undefined ? undefined : findVariable(context, root, root.name);
  if (variable === undefined || MODULE_SCOPES.has(variable.scope.type)) {
    return false;
  }
  const definition = variable.defs[0];
  return definition?.type !== 'Variable' || definition.node.init === null;
}

function withoutNative(callee) {
  const target = unwrapped(callee);
  return target?.type === 'MemberExpression' && memberName(target) === 'native'
    ? target.object
    : target;
}

function calledName(context, callee, bindings) {
  const imported = importedFunction(context, callee, bindings);
  if (imported !== undefined) {
    return imported;
  }
  return callee.type === 'MemberExpression' &&
    callee.computed &&
    isModuleValue(context, callee.object, bindings)
    ? memberName(callee)
    : undefined;
}

function syncCall(context, families, call) {
  const callee = withoutNative(call.callee);
  if (isShadowed(context, callee)) {
    return undefined;
  }
  for (const { family, bindings } of families) {
    const name = calledName(context, callee, bindings);
    if (name !== undefined && family.matches(name)) {
      return { name, family };
    }
  }
  return undefined;
}

function fileScope(program, text) {
  const workerBindings = bindingsOf(program, WORKER_MODULE_NAMES);
  if (isWorkerScript(workerBindings, text) || text.startsWith('#!')) {
    return undefined;
  }
  return {
    families: SYNC_FAMILIES.map((family) => ({
      family,
      bindings: bindingsOf(program, family.modules),
    })),
    frameworks: frameworkNames(program, bindingsOf(program, FRAMEWORK_MODULE_NAMES)),
    nestBindings: bindingsOf(program, NEST_MODULES),
    workerBindings,
  };
}

function reportCandidates(context, { candidates, calls, scope }) {
  const handlers = routeHandlers(context, calls, scope.frameworks);
  for (const { node, name, family } of candidates) {
    const found = enclosingContext(node, { handlers, nestBindings: scope.nestBindings });
    if (
      found === undefined ||
      isWorkerBranch(node, scope.workerBindings) ||
      (found.kind === 'async' && isStartupFunction(context, found.fn))
    ) {
      continue;
    }
    context.report({
      node,
      messageId: 'blocking',
      data: {
        api: name,
        context: CONTEXT_NAMES[found.kind],
        alternative: family.alternative(name),
      },
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
        '`{{api}}` blocks the event loop inside {{context}}, so every other request and task waits until it returns. Use {{alternative}}.',
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
