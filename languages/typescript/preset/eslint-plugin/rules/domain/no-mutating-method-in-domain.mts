import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { copyingMethodFix } from '../../fixes/code/copying-method-fix.mts';
import { fixable } from '../../fixes/support/descriptors.mts';
import {
  isArrayMutator,
  mutatedOwner,
  staticName,
} from '../analysis/mutation/mutating-methods.mts';
import { typeServices } from '../security/security-values.mts';
import { nameOf } from '../typed/node-views.mts';

type Docs = { readonly requiresTypeChecking: boolean };

const INDIRECT_CALLS = new Set(['call', 'apply', 'bind']);

function isPlainCallee(node: TSESTree.MemberExpression): boolean {
  return (
    !node.computed &&
    node.parent.type === AST_NODE_TYPES.CallExpression &&
    node.parent.callee === node
  );
}

function isReportedBySyntax(node: TSESTree.MemberExpression, method: string): boolean {
  if (!isArrayMutator(method) || node.computed) {
    return false;
  }
  if (isPlainCallee(node)) {
    return true;
  }
  const outer = node.parent;
  return (
    outer.type === AST_NODE_TYPES.MemberExpression &&
    outer.object === node &&
    INDIRECT_CALLS.has(nameOf(outer.property) ?? '') &&
    isPlainCallee(outer)
  );
}

export const rule: TSESLint.RuleModule<'mutatingMethod', [], Docs> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Disallow mutating methods of arrays, Set, Map, Date, typed arrays, Buffer and URLSearchParams in domain code',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      mutatingMethod:
        'domain/ code does not mutate values, and {{owner}}.{{method}} changes the value it is called on: build a new value instead, e.g. new Set([...set, x]), new Map([...map, [key, value]]), new Map(xs.map((x) => [x.id, x] as const)) or new Date(ms + delta).',
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      throw new Error(
        'no-mutating-method-in-domain needs type information (parserOptions.projectService)',
      );
    }
    return {
      MemberExpression(node: TSESTree.MemberExpression) {
        const method = staticName(node, services);
        if (method === undefined || isReportedBySyntax(node, method)) {
          return;
        }
        const owner = mutatedOwner(node, method, services);
        if (owner !== undefined) {
          const plan = owner === 'Array' ? copyingMethodFix(services, node, method) : undefined;
          context.report(
            fixable({ node, messageId: 'mutatingMethod', data: { owner, method } }, plan),
          );
        }
      },
    };
  },
};
