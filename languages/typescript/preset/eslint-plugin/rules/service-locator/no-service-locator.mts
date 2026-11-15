import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';
import { displayedLibrary, isModeledPackage } from './container-apis.mts';
import { rootFileMatcher, rootFileOptionsSchema, type RootFileOptions } from './root-files.mts';
import { createResolverSummaries } from './summaries/resolver-summaries.mts';

type Options = readonly [RootFileOptions?];
type Docs = { readonly requiresTypeChecking: boolean };
export type CheckedNode =
  | TSESTree.CallExpression
  | TSESTree.NewExpression
  | TSESTree.MemberExpression
  | TSESTree.Property
  | TSESTree.Identifier;
type Summaries = ReturnType<typeof createResolverSummaries>;
type MessageId = 'lookup' | 'wrapper';
export type LocatorScope = {
  readonly filename: string;
  readonly options: Options;
  readonly program: TypeScript.Program | undefined;
  readonly tsNodeOf: (node: CheckedNode) => TypeScript.Node | undefined;
  readonly report: (descriptor: TSESLint.ReportDescriptor<MessageId>) => void;
};

const ALLOWED_FORM =
  'Take the dependency as a constructor parameter typed with the narrow interface the code needs, or build it in a factory provider (`useFactory`, `toDynamicValue`), and look it up only where the app is composed (the composition root: main, server, or a file listed in "layout.entryPoints").';
const FAILURE =
  'A lookup hides what this code needs from its signature and fails only when it runs, if the registration is missing.';

const WRAPPER_FORM =
  'Take the dependency as a constructor parameter typed with the narrow interface the code needs, or build it in a factory provider (`useFactory`, `toDynamicValue`), instead of asking a helper for it.';

const summariesByProgram = new WeakMap<TypeScript.Program, Summaries>();
const containerUseByProgram = new WeakMap<TypeScript.Program, ReadonlySet<string>>();

function remembered<Key extends WeakKey, Value>(
  cache: WeakMap<Key, Value>,
  key: Key,
  build: () => Value,
): Value {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const built = build();
  cache.set(key, built);
  return built;
}

function textOf(node: TypeScript.Node): string {
  return 'text' in node && typeof node.text === 'string' ? node.text : '';
}

function importedModules(source: TypeScript.SourceFile): string[] {
  return source.statements.flatMap((statement) => {
    if (ts.isImportEqualsDeclaration(statement)) {
      const reference = statement.moduleReference;
      return ts.isExternalModuleReference(reference) ? [textOf(reference.expression)] : [];
    }
    const specifier =
      ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        ? statement.moduleSpecifier
        : undefined;
    return specifier !== undefined && ts.isStringLiteral(specifier) ? [specifier.text] : [];
  });
}

function containerPackages(program: TypeScript.Program): ReadonlySet<string> {
  return remembered(
    containerUseByProgram,
    program,
    () =>
      new Set(
        program
          .getSourceFiles()
          .filter(
            (source) =>
              !(source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source)),
          )
          .flatMap((source) => importedModules(source).filter((name) => isModeledPackage(name))),
      ),
  );
}

function summariesFor(program: TypeScript.Program): Summaries {
  return remembered(summariesByProgram, program, () => createResolverSummaries({ program }));
}

const FUNCTION_METHODS = new Set(['call', 'apply', 'bind']);

function isReferencePosition(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  if (
    parent.type === AST_NODE_TYPES.CallExpression ||
    parent.type === AST_NODE_TYPES.NewExpression
  ) {
    return parent.arguments.includes(node);
  }
  return (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node &&
    !parent.computed &&
    FUNCTION_METHODS.has(parent.property.name)
  );
}

export function locatorListeners(scope: LocatorScope): TSESLint.RuleListener {
  const { program, options, filename } = scope;
  if (
    program === undefined ||
    rootFileMatcher(options[0])(filename) ||
    containerPackages(program).size === 0
  ) {
    return {};
  }
  const target = program;
  const summaries = summariesFor(target);

  function check(node: CheckedNode): void {
    const tsNode = scope.tsNodeOf(node);
    const found = tsNode === undefined ? undefined : summaries.lookupAt(tsNode);
    if (found === undefined) {
      return;
    }
    const { owner, member } = found.api;
    const file = target.getSourceFile(filename);
    const own = found.kind === 'lookup' && file !== undefined ? importedModules(file) : [];
    const library = displayedLibrary(found.api, [...own, ...containerPackages(target)]);
    scope.report({
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
}

export const rule: TSESLint.RuleModule<MessageId, Options, Docs> = {
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
    const services = typeServices(context);
    return locatorListeners({
      filename: context.filename,
      options: context.options,
      program: services?.program,
      tsNodeOf: (node) => services?.esTreeNodeToTSNodeMap.get(node),
      report: (descriptor) => {
        context.report(descriptor);
      },
    });
  },
};
