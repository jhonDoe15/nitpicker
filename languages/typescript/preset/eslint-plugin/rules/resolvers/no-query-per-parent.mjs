import { callsWithin } from '../effects/held-scopes.mjs';
import { importedBindings } from '../security/imported-names.mjs';
import { enclosingLoop } from '../loops/loop-shapes.mjs';
import { chainOuterCall, describePath, ioEffect, ioKind } from '../support/io-effects.mjs';
import { isListParent } from './list-parents.mjs';
import { resolverSite } from './resolver-sites.mjs';

const LOADER_WORDS = /loader|cache/iu;
const LOADER_METHODS = new Set(['load', 'loadMany']);

function namesOf(call) {
  const names = [];
  const pending = [call.callee];
  for (const current of pending) {
    if (current.type === 'MemberExpression') {
      names.push(current.computed ? '' : current.property.name);
      pending.push(current.object);
    } else if (current.type === 'CallExpression') {
      pending.push(current.callee);
    } else {
      names.push(current.type === 'Identifier' ? current.name : '');
    }
  }
  return names;
}

const PRISMA_BATCHED = new Set(['findUnique', 'findUniqueOrThrow']);
const PRISMA_NAME = /prisma/iu;

function isPrismaBatched(call, context) {
  const names = namesOf(call);
  const prisma =
    names.some((name) => PRISMA_NAME.test(name)) ||
    [...importedBindings(context.sourceCode.ast).values()].some(({ module }) =>
      module.endsWith('prisma/client'),
    );
  return prisma && names.some((name) => PRISMA_BATCHED.has(name));
}

function isBatched(call) {
  const [method, ...owners] = namesOf(call);
  return LOADER_METHODS.has(method) || owners.some((name) => LOADER_WORDS.test(name));
}

function reportedCalls(context, fn) {
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

export const rule = {
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
    function check(node) {
      const site = resolverSite(context.sourceCode, node);
      if (site === undefined || !isListParent(site.parent, context)) {
        return;
      }
      for (const call of reportedCalls(context, site.fn)) {
        const { path } = ioEffect(call, context);
        context.report({
          node: call,
          messageId: 'perParent',
          data: { callee: describePath(path), parent: site.parent },
        });
      }
    }
    return { MethodDefinition: check, Property: check };
  },
};
