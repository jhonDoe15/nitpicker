import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { projectSourceMatches } from '../support/package-facts.mts';
import { projectHookLacksFailureHandler } from './hook-definitions.mts';
import { mutationBinding, type Mutation } from './mutation-bindings.mts';
import { readOptions, type OptionsReading } from './mutation-options.mts';

const hookNamePattern = /^use[A-Z][A-Za-z0-9]*$/u;
const optionsName = /opt|config|handlers|callbacks/iu;
const centralHandler =
  /new\s+MutationCache\s*\(\s*\{[^]{0,400}?\bonError\b|\bmutations\s*:\s*\{[^}]{0,400}?\bonError\b/u;

function importedFrom(definitions: readonly TSESLint.Scope.Definition[]): string | undefined {
  const [only] = definitions;
  return definitions.length === 1 &&
    only?.type === TSESLint.Scope.DefinitionType.ImportBinding &&
    only.parent.type === AST_NODE_TYPES.ImportDeclaration
    ? String(only.parent.source.value)
    : undefined;
}

function isMutationHook(sourceCode: SourceCode, callee: TSESTree.Node, filename: string): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return !callee.computed && nameOf(callee.property) === 'useMutation';
  }
  if (callee.type !== AST_NODE_TYPES.Identifier || !hookNamePattern.test(callee.name)) {
    return false;
  }
  if (callee.name === 'useMutation') {
    return true;
  }
  const source = importedFrom(variableNamed(sourceCode, callee)?.defs ?? []);
  return source !== undefined && projectHookLacksFailureHandler(source, filename, callee.name);
}

function handlesRejection(call: TSESTree.CallExpression): boolean {
  const chained = call.parent;
  if (chained.type === AST_NODE_TYPES.MemberExpression && chained.object === call) {
    return ['catch', 'then'].includes(nameOf(chained.property) ?? '');
  }
  let node: TSESTree.Node = call;
  while (node.parent.type !== AST_NODE_TYPES.Program) {
    const { parent } = node;
    if (
      parent.type === AST_NODE_TYPES.TryStatement &&
      parent.block === node &&
      parent.handler !== null
    ) {
      return true;
    }
    if (
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression
    ) {
      return false;
    }
    node = parent;
  }
  return false;
}

function resultIsDropped(call: TSESTree.CallExpression): boolean {
  let node: TSESTree.Node = call;
  while (
    node.parent.type === AST_NODE_TYPES.AwaitExpression ||
    (node.parent.type === AST_NODE_TYPES.UnaryExpression && node.parent.operator === 'void')
  ) {
    node = node.parent;
  }
  return (
    node.parent.type === AST_NODE_TYPES.ExpressionStatement ||
    (node !== call && node.parent.type === AST_NODE_TYPES.VariableDeclarator)
  );
}

function hookOptionsOf(hook: TSESTree.CallExpression): OptionsReading {
  if (hook.callee.type === AST_NODE_TYPES.Identifier && hook.callee.name === 'useMutation') {
    return readOptions(hook.arguments[0]);
  }
  const objects = hook.arguments.filter((each) => each.type === AST_NODE_TYPES.ObjectExpression);
  const opaque = hook.arguments.some(
    (each) =>
      each.type === AST_NODE_TYPES.SpreadElement ||
      (each.type === AST_NODE_TYPES.Identifier && optionsName.test(each.name)),
  );
  return opaque || objects.length > 1 ? 'unknown' : readOptions(objects[0]);
}

function callOf(trigger: TSESTree.Node): TSESTree.CallExpression | undefined {
  const parent = trigger.parent;
  return parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === trigger
    ? parent
    : undefined;
}

type Context = Readonly<TSESLint.RuleContext<'dropsFailure', []>>;

function reportMutation(context: Context, { hook, triggers, looseUses }: Mutation): void {
  const hookOptions = hookOptionsOf(hook);
  if (hookOptions === 'unknown' || hookOptions.failure) {
    return;
  }
  const calls = [...triggers].flatMap(([trigger, kind]) => {
    const call = callOf(trigger);
    return call === undefined ? [] : [{ call, kind, options: readOptions(call.arguments[1]) }];
  });
  if (calls.some(({ options }) => options === 'unknown')) {
    return;
  }
  const usable = calls.filter(
    ({ call, kind, options }) =>
      options !== 'unknown' &&
      !options.failure &&
      (kind === 'mutate' || (resultIsDropped(call) && !handlesRejection(call))),
  );
  if (hookOptions.success && !looseUses && usable.length === calls.length) {
    context.report({ node: hook, messageId: 'dropsFailure' });
    return;
  }
  for (const { call, options } of usable) {
    if (options !== 'unknown' && options.success) {
      context.report({ node: call, messageId: 'dropsFailure' });
    }
  }
}

export const rule: TSESLint.RuleModule<'dropsFailure'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow React Query mutations that handle success but drop failure' },
    schema: [],
    messages: {
      dropsFailure:
        'This mutation reports success but drops failures: pass `onError` (`onError: (error) => ' +
        'toast.error(error.message)`), `throwOnError`, or show `error` / `isError` from the mutation. ' +
        'An exception fits when `MutationCache` `onError` is set for every mutation.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const mutations: Mutation[] = [];
    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        const init = node.init?.type === AST_NODE_TYPES.AwaitExpression ? undefined : node.init;
        if (
          init?.type === AST_NODE_TYPES.CallExpression &&
          isMutationHook(sourceCode, init.callee, context.filename)
        ) {
          const mutation = mutationBinding(sourceCode, node, init);
          if (mutation !== undefined) {
            mutations.push(mutation);
          }
        }
      },
      'Program:exit'() {
        const reported = mutations.filter(
          ({ failureRead, triggers }) => !failureRead && triggers.size > 0,
        );
        if (reported.length === 0 || projectSourceMatches(context.filename, centralHandler)) {
          return;
        }
        for (const mutation of reported) {
          reportMutation(context, mutation);
        }
      },
    };
  },
};
