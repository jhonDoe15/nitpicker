import ts from 'typescript';
import { displayedLibrary, isModeledPackage } from './container-apis.mjs';
import { rootFileMatcher, rootFileOptionsSchema } from './root-files.mjs';
import { createResolverSummaries } from './summaries/resolver-summaries.mjs';

const ALLOWED_FORM =
  'Take the dependency as a constructor parameter typed with the narrow interface the code needs, or build it in a factory provider (`useFactory`, `toDynamicValue`), and look it up only where the app is composed (the composition root: main, server, or a file listed in "layout.entryPoints").';
const FAILURE =
  'A lookup hides what this code needs from its signature and fails only when it runs, if the registration is missing.';

const WRAPPER_FORM =
  'Take the dependency as a constructor parameter typed with the narrow interface the code needs, or build it in a factory provider (`useFactory`, `toDynamicValue`), instead of asking a helper for it.';

const summariesByProgram = new WeakMap();
const containerUseByProgram = new WeakMap();

function remembered(cache, key, build) {
  if (!cache.has(key)) {
    cache.set(key, build());
  }
  return cache.get(key);
}

function importedModules(source) {
  return source.statements.flatMap((statement) => {
    if (ts.isImportEqualsDeclaration(statement)) {
      const reference = statement.moduleReference;
      return ts.isExternalModuleReference(reference) ? [reference.expression.text ?? ''] : [];
    }
    const specifier = statement.moduleSpecifier;
    return specifier !== undefined && ts.isStringLiteral(specifier) ? [specifier.text] : [];
  });
}

function containerPackages(program) {
  return remembered(
    containerUseByProgram,
    program,
    () =>
      new Set(
        program
          .getSourceFiles()
          .filter(
            (source) =>
              !source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source),
          )
          .flatMap((source) => importedModules(source).filter((name) => isModeledPackage(name))),
      ),
  );
}

function summariesFor(program) {
  return remembered(summariesByProgram, program, () => createResolverSummaries({ program }));
}

const FUNCTION_METHODS = new Set(['call', 'apply', 'bind']);

function isReferencePosition(node) {
  const { parent } = node;
  if (parent.type === 'CallExpression' || parent.type === 'NewExpression') {
    return parent.arguments.includes(node);
  }
  return (
    parent.type === 'MemberExpression' &&
    parent.object === node &&
    !parent.computed &&
    FUNCTION_METHODS.has(parent.property.name)
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
      wrapper: `\`{{ name }}()\` looks up the token it is given in a container (it calls \`{{ api }}\` in {{ file }}), so this call is a service lookup. ${WRAPPER_FORM} ${FAILURE}`,
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const options = context.options[0];
    if (
      services?.program === null ||
      services?.program === undefined ||
      rootFileMatcher(options)(context.filename) ||
      containerPackages(services.program).size === 0
    ) {
      return {};
    }
    const summaries = summariesFor(services.program);

    function check(node) {
      const found = summaries.lookupAt(services.esTreeNodeToTSNodeMap.get(node));
      if (found === undefined) {
        return;
      }
      const { owner, member } = found.api;
      const own =
        found.kind === 'lookup'
          ? importedModules(services.program.getSourceFile(context.filename))
          : [];
      const library = displayedLibrary(found.api, [...own, ...containerPackages(services.program)]);
      context.report({
        node,
        messageId: found.kind,
        data: { name: found.name, api: `${library} ${owner}.${member}`, file: found.file },
      });
    }

    return {
      CallExpression: check,
      NewExpression: check,
      MemberExpression: check,
      'ObjectPattern > Property': check,
      Identifier(node) {
        if (isReferencePosition(node)) {
          check(node);
        }
      },
    };
  },
};
