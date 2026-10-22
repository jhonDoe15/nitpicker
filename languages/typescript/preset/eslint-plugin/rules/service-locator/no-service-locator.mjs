import { createResolverSummaries } from './resolver-summaries.mjs';
import { rootFileMatcher, rootFileOptionsSchema } from './root-files.mjs';

const ALLOWED_FORM =
  'Take the dependency as a parameter typed with the narrow interface the code needs, and look it up only where the app is composed (the composition root: main, server or a configured entry point) or inside a registration factory (`useFactory`, `toDynamicValue`).';
const FAILURE =
  'A lookup hides what this code needs from its signature and fails only when it runs, if the registration is missing.';

const summariesByProgram = new WeakMap();

function remembered(cache, key, build) {
  if (!cache.has(key)) {
    cache.set(key, build());
  }
  return cache.get(key);
}

function summariesFor(program, options) {
  const perOptions = remembered(summariesByProgram, program, () => new Map());
  return remembered(perOptions, JSON.stringify(options ?? {}), () =>
    createResolverSummaries({ program, isRoot: rootFileMatcher(options) }),
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow service lookups in a DI container (inversify, tsyringe, typedi, awilix, NestJS ModuleRef and application context), direct or through project helpers, outside the composition root',
      requiresTypeChecking: true,
    },
    schema: rootFileOptionsSchema,
    messages: {
      lookup: `${ALLOWED_FORM} \`{{ api }}\` is a service lookup. ${FAILURE}`,
      wrapper: `${ALLOWED_FORM} \`{{ name }}()\` is a service lookup behind a helper: it calls \`{{ api }}\` in {{ file }}. ${FAILURE}`,
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const options = context.options[0];
    if (
      services?.program === null ||
      services?.program === undefined ||
      rootFileMatcher(options)(context.filename)
    ) {
      return {};
    }
    const summaries = summariesFor(services.program, options);

    function check(node) {
      const found = summaries.lookupAt(services.esTreeNodeToTSNodeMap.get(node));
      if (found === undefined) {
        return;
      }
      const { library, owner, member } = found.api;
      context.report({
        node,
        messageId: found.kind,
        data: { name: found.name, api: `${library} ${owner}.${member}`, file: found.file },
      });
    }

    return {
      CallExpression: check,
      MemberExpression(node) {
        if (!node.computed && node.property.name === 'cradle') {
          check(node);
        }
      },
    };
  },
};
