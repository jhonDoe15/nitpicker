import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { callsWithin } from '../effects/held-scopes.mts';
import { importedBindings } from '../security/imported-names.mts';
import { enclosingLoop } from '../loops/loop-shapes.mts';
import type { Context } from '../security/security-values.mts';
import { chainOuterCall, describePath, ioEffect, ioKind } from '../support/io-effects.mts';
import { isListParent } from './list-parents.mts';
import { nameOf } from '../typed/node-views.mts';
import type { Callback } from '../typed/syntax-views.mts';
import { resolverSite } from './resolver-sites.mts';

type Call = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;

const LOADER_WORDS = /loader|cache/iu;
const LOADER_METHODS = new Set(['load', 'loadMany']);

function namesOf(call: Call): string[] {
  const names: string[] = [];
  const pending: TSESTree.Node[] = [
    call.type === AST_NODE_TYPES.CallExpression ? call.callee : call.tag,
  ];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      names.push(current.computed ? '' : (nameOf(current.property) ?? ''));
      pending.push(current.object);
    } else if (current.type === AST_NODE_TYPES.CallExpression) {
      pending.push(current.callee);
    } else {
      names.push(current.type === AST_NODE_TYPES.Identifier ? current.name : '');
    }
  }
  return names;
}

const PRISMA_BATCHED = new Set(['findUnique', 'findUniqueOrThrow']);
const PRISMA_NAME = /prisma/iu;

function isPrismaBatched(call: Call, context: Context): boolean {
  const names = namesOf(call);
  const prisma =
    names.some((name) => PRISMA_NAME.test(name)) ||
    [...importedBindings(context.sourceCode.ast).values()].some(({ module }) =>
      module.endsWith('prisma/client'),
    );
  return prisma && names.some((name) => PRISMA_BATCHED.has(name));
}

function isBatched(call: Call): boolean {
  const [method = '', ...owners] = namesOf(call);
  return LOADER_METHODS.has(method) || owners.some((name) => LOADER_WORDS.test(name));
}

function reportedCalls(context: Context, fn: Callback): Call[] {
  return callsWithin(fn.body, context.sourceCode.visitorKeys).filter((call) => {
    const effect = ioEffect(call, context);
    const outer = chainOuterCall(call);
    return (
      effect !== undefined &&
      effect.kind !== 'message' &&
      !isBatched(call) &&
      !isPrismaBatched(call, context) &&
      enclosingLoop(call, context) === undefined &&
      (outer === undefined || ioKind(outer, context) !== effect.kind)
    );
  });
}

export const rule: TSESLint.RuleModule<
  'perParent',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Do not query the database or call a service once per parent in a GraphQL field resolver',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      perParent: [
        'This field resolver runs {{callee}} once per `{{parent}}` object, and `{{parent}}` is returned as a list:',
        'N parents cost N queries. Batch it with a DataLoader created per request (`loaders.owner.load(parent.ownerId)`),',
        'read data already on the parent, or read a request-scoped cache.',
        'An exception fits only when the list of `{{parent}}` objects is always tiny.',
      ].join(' '),
    },
  },
  create(context) {
    function check(node: TSESTree.MethodDefinition | TSESTree.Property): void {
      const site = resolverSite(context.sourceCode, node);
      if (site === undefined || !isListParent(site.parent, context)) {
        return;
      }
      for (const call of reportedCalls(context, site.fn)) {
        const effect = ioEffect(call, context);
        if (effect === undefined) {
          continue;
        }
        context.report({
          node: call,
          messageId: 'perParent',
          data: { callee: describePath(effect.path), parent: site.parent },
        });
      }
    }
    return { MethodDefinition: check, Property: check };
  },
};
