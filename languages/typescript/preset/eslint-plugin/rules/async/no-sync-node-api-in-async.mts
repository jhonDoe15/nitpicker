import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import {
  bindingsOf,
  importedFunction,
  isModuleValue,
  type ModuleBindings,
} from '../security/imported-names.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import {
  enclosingContext,
  frameworkNames,
  isDirectlyIn,
  isStartupFunction,
  isWorkerBranch,
  routeHandlers,
} from './async-contexts.mts';
import {
  FRAMEWORK_MODULES,
  SYNC_FAMILIES,
  WORKER_MODULES,
  type SyncFamily,
} from './sync-node-apis.mts';

type FamilyBindings = { readonly family: SyncFamily; readonly bindings: ModuleBindings };
type FileScope = {
  readonly families: readonly FamilyBindings[];
  readonly frameworks: ReadonlySet<string>;
  readonly nestBindings: ModuleBindings;
  readonly workerBindings: ModuleBindings;
};
type Candidate = {
  readonly node: TSESTree.CallExpression;
  readonly name: string;
  readonly family: SyncFamily;
};

const { DefinitionType, ScopeType } = TSESLint.Scope;

const WORKER_MODULE_NAMES = new Set(WORKER_MODULES);
const FRAMEWORK_MODULE_NAMES = new Set(FRAMEWORK_MODULES);
const WORKER_SCRIPT_BINDINGS = new Set<string>(['parentPort', 'workerData']);
const WORKER_SCRIPT_MEMBER = /\.(?:parentPort|workerData)\b/u;
const NEST_MODULES = new Set(['@nestjs/common']);
const CONTEXT_NAMES: Readonly<Record<'async' | 'handler', string>> = {
  async: 'an async function',
  handler: 'a request handler',
};

const CALLBACK_ADVICE =
  'a loop in place of the synchronous callback (or `Promise.all` over `map` with an async callback), because `await` cannot go inside it, and then ';

function isWorkerScript(bindings: ModuleBindings, text: string): boolean {
  const named = [...bindings.named.values()].some((name) => WORKER_SCRIPT_BINDINGS.has(name));
  return named || (bindings.namespaces.size > 0 && WORKER_SCRIPT_MEMBER.test(text));
}

function rootIdentifier(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const chain = [unwrapped(node)];
  for (const current of chain) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      chain.push(unwrapped(current.object));
    }
  }
  const root = chain.at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root : undefined;
}

function isShadowed(context: Context, callee: TSESTree.Node): boolean {
  const root = rootIdentifier(callee);
  const variable = root === undefined ? undefined : findVariable(context, root, root.name);
  if (
    variable === undefined ||
    variable.scope.type === ScopeType.module ||
    variable.scope.type === ScopeType.global
  ) {
    return false;
  }
  const definition = variable.defs[0];
  return definition?.type !== DefinitionType.Variable || definition.node.init === null;
}

function withoutNative(callee: TSESTree.Node): TSESTree.Node {
  const target = unwrapped(callee);
  return target.type === AST_NODE_TYPES.MemberExpression && memberName(target) === 'native'
    ? target.object
    : target;
}

function calledName(
  context: Context,
  callee: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  const imported = importedFunction(context, callee, bindings);
  if (imported !== undefined) {
    return imported;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.computed &&
    isModuleValue(context, callee.object, bindings)
    ? memberName(callee)
    : undefined;
}

function syncCall(
  context: Context,
  families: readonly FamilyBindings[],
  call: TSESTree.CallExpression,
): { readonly name: string; readonly family: SyncFamily } | undefined {
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

function fileScope(program: TSESTree.Program, text: string): FileScope | undefined {
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

function reportCandidates(
  context: Context,
  {
    candidates,
    calls,
    scope,
  }: {
    readonly candidates: readonly Candidate[];
    readonly calls: readonly TSESTree.CallExpression[];
    readonly scope: FileScope;
  },
): void {
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
    const alternative = family.alternative(name);
    context.report({
      node,
      messageId: 'blocking',
      data: {
        api: name,
        context: CONTEXT_NAMES[found.kind],
        alternative: isDirectlyIn(node, found.fn)
          ? alternative
          : `${CALLBACK_ADVICE}${alternative}`,
      },
    });
  }
}

export const rule: TSESLint.RuleModule<'blocking'> = {
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
    const calls: TSESTree.CallExpression[] = [];
    const candidates: Candidate[] = [];
    let scope: FileScope | undefined;

    return {
      Program(program: TSESTree.Program) {
        scope = fileScope(program, sourceCode.text);
      },
      CallExpression(node: TSESTree.CallExpression) {
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
