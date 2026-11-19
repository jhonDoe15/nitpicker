import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  chainOf,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { projectSourceMatches } from '../support/package-facts.mts';
import { projectHookLacksFailureHandler } from './hook-definitions.mts';
import { mutationBinding, type Mutation } from './mutation-bindings.mts';
import { readOptions, type OptionsReading } from './mutation-options.mts';

const USE_MUTATION = 'useMutation';
const UNKNOWN = 'unknown';
const hookNamePattern = /^use[A-Z][A-Za-z0-9]*$/u;
const optionsName = /opt|config|handlers|callbacks/iu;
const centralHandler =
  /new\s+MutationCache\s*\(\s*\{[^]{0,400}?\bonError\b|\bmutations\s*:\s*\{[^}]{0,400}?\bonError\b/u;

function importedFrom(definitions: readonly TSESLint.Scope.Definition[]): string | undefined {
  const [only] = definitions;
  return definitions.length === 1 &&
    only?.type === TSESLint.Scope.DefinitionType.ImportBinding &&
    only.parent.type === AST_NODE_TYPES.ImportDeclaration
    ? only.parent.source.value
    : undefined;
}

function isMutationHook(sourceCode: SourceCode, callee: TSESTree.Node, filename: string): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return !callee.computed && nameOf(callee.property) === USE_MUTATION;
  }
  if (callee.type !== AST_NODE_TYPES.Identifier || !hookNamePattern.test(callee.name)) {
    return false;
  }
  if (callee.name === USE_MUTATION) {
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
  const path = [call, ...ancestorsOf(call)];
  const links = path.flatMap((child, index) => {
    const parent = path[index + 1];
    return parent === undefined ? [] : [{ child, parent }];
  });
  for (const { child, parent } of links) {
    if (
      parent.type === AST_NODE_TYPES.TryStatement &&
      parent.block === child &&
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
  }
  return false;
}

function wrapperParent(link: TSESTree.Node): TSESTree.Node | undefined {
  const parent = link.parent;
  const wrapped =
    parent?.type === AST_NODE_TYPES.AwaitExpression ||
    (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'void');
  return wrapped ? parent : undefined;
}

function resultIsDropped(call: TSESTree.CallExpression): boolean {
  const node = chainOf<TSESTree.Node>(call, wrapperParent).at(-1) ?? call;
  return (
    node.parent?.type === AST_NODE_TYPES.ExpressionStatement ||
    (node !== call && node.parent?.type === AST_NODE_TYPES.VariableDeclarator)
  );
}

function hookOptionsOf(hook: TSESTree.CallExpression): OptionsReading {
  if (hook.callee.type === AST_NODE_TYPES.Identifier && hook.callee.name === USE_MUTATION) {
    return readOptions(hook.arguments[0]);
  }
  const objects = hook.arguments.filter((each) => each.type === AST_NODE_TYPES.ObjectExpression);
  const opaque = hook.arguments.some(
    (each) =>
      each.type === AST_NODE_TYPES.SpreadElement ||
      (each.type === AST_NODE_TYPES.Identifier && optionsName.test(each.name)),
  );
  return opaque || objects.length > 1 ? UNKNOWN : readOptions(objects[0]);
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
  if (hookOptions === UNKNOWN || hookOptions.failure) {
    return;
  }
  const calls = [...triggers].flatMap(([trigger, kind]) => {
    const call = callOf(trigger);
    return call === undefined ? [] : [{ call, kind, options: readOptions(call.arguments[1]) }];
  });
  if (calls.some(({ options }) => options === UNKNOWN)) {
    return;
  }
  const usable = calls.filter(
    ({ call, kind, options }) =>
      options !== UNKNOWN &&
      !options.failure &&
      (kind === 'mutate' || (resultIsDropped(call) && !handlesRejection(call))),
  );
  if (hookOptions.success && !looseUses && usable.length === calls.length) {
    context.report({ node: hook, messageId: 'dropsFailure' });
    return;
  }
  for (const { call, options } of usable) {
    if (options !== UNKNOWN && options.success) {
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
