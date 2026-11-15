import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import type { ParserServicesWithTypeInformation } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { layoutFeatures as untypedLayoutFeatures } from '../../../architecture/strict-layout.mjs';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { exportLeaks } from './contract-members.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type Context = Readonly<TSESLint.RuleContext<'persistence' | 'transport', []>>;
type Leak = ReturnType<typeof exportLeaks>[number];
type Services = ParserServicesWithTypeInformation;
type Scope = { readonly checker: TypeScript.TypeChecker; readonly services: Services };
type DeclarationNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.ClassDeclaration
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration
  | TSESTree.TSDeclareFunction;

const layoutFeatures: { readonly feature: string } = untypedLayoutFeatures;

const FEATURE_INDEX = new RegExp(`${layoutFeatures.feature}/index\\.[cm]?[jt]sx?$`, 'u');

function isDeclarationNode(node: TSESTree.Node): node is DeclarationNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.ClassDeclaration ||
    node.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
    node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
    node.type === AST_NODE_TYPES.TSDeclareFunction
  );
}

function nameOf(node: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return node.type === AST_NODE_TYPES.Identifier ? node.name : node.value;
}

function declaredNames(declaration: TSESTree.Node): string[] {
  if (isDeclarationNode(declaration)) {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  return declaration.type === AST_NODE_TYPES.VariableDeclaration
    ? declaration.declarations.flatMap(({ id }) =>
        id.type === AST_NODE_TYPES.Identifier ? [id.name] : [],
      )
    : [];
}

function namedExports(statement: TSESTree.Node): string[] {
  if (statement.type === AST_NODE_TYPES.ExportNamedDeclaration) {
    return [
      ...statement.specifiers.map((specifier) => nameOf(specifier.exported)),
      ...(statement.declaration === null ? [] : declaredNames(statement.declaration)),
    ];
  }
  if (statement.type === AST_NODE_TYPES.ExportAllDeclaration && statement.exported !== null) {
    return [nameOf(statement.exported)];
  }
  return statement.type === AST_NODE_TYPES.ExportDefaultDeclaration ? ['default'] : [];
}

function starSources(
  statements: readonly TSESTree.ProgramStatement[],
  { checker, services }: Scope,
): { readonly statement: TSESTree.ExportAllDeclaration; readonly names: Set<string> }[] {
  return statements.flatMap((statement) => {
    if (statement.type !== AST_NODE_TYPES.ExportAllDeclaration || statement.exported !== null) {
      return [];
    }
    const source = services.esTreeNodeToTSNodeMap.get(statement.source);
    const target = checker.getSymbolAtLocation(source);
    const names =
      target === undefined ? [] : checker.getExportsOfModule(target).map(({ name }) => name);
    return [{ statement, names: new Set(names) }];
  });
}

function exportAnchors(program: TSESTree.Program, context: Scope): (name: string) => TSESTree.Node {
  const named = new Map<string, TSESTree.Node>();
  for (const statement of program.body) {
    for (const name of namedExports(statement)) {
      named.set(name, statement);
    }
  }
  const stars = starSources(program.body, context);
  return (name) =>
    named.get(name) ?? stars.find(({ names }) => names.has(name))?.statement ?? program;
}

function leaksOf(
  checker: TypeScript.TypeChecker,
  moduleSymbol: TypeScript.Symbol,
): (Leak & { readonly exportName: string })[] {
  const seen = new Set<string>();
  return checker.getExportsOfModule(moduleSymbol).flatMap((exported) =>
    exportLeaks(checker, exported)
      .map((leak) => ({ ...leak, exportName: exported.name }))
      .filter(({ member, found }) => {
        const key = `${member}|${found.packageName}|${found.name}`;
        const fresh = !seen.has(key);
        seen.add(key);
        return fresh;
      }),
  );
}

function reportLeaks(
  context: Context,
  program: TSESTree.Program,
  { checker, services }: Scope,
): void {
  const moduleSymbol = checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(program));
  if (moduleSymbol === undefined) {
    return;
  }
  const anchorOf = exportAnchors(program, { checker, services });
  const feature = path.basename(path.dirname(context.filename));
  for (const { member, found, exportName } of leaksOf(checker, moduleSymbol)) {
    context.report({
      node: anchorOf(exportName),
      messageId: found.kind,
      data: { member, type: found.name, package: found.packageName, feature },
    });
  }
}

export const rule: TSESLint.RuleModule<'persistence' | 'transport', [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep persistence handles and request or response objects out of the exports of a feature index',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      persistence:
        "Take a repository or a port interface and return a domain type or a plain record from {{member}}: {{type}} from {{package}} is a persistence handle, so every importer of feature {{feature}} depends on its database session. Keep {{type}} in the feature's adapters behind the index; a factory (a function that returns an object synchronously) that receives it from the composition root is fine. An exception fits only when the feature deliberately hands out the handle, such as a shared transaction helper.",
      transport:
        'Take plain values and return a domain type or a plain record from {{member}}: {{type}} from {{package}} is a request or response object, so every importer of feature {{feature}} needs a live HTTP exchange. Read it in the route handler and pass the values in. An exception fits only when the export is a route handler or middleware the framework calls with a different first parameter.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!(
      FEATURE_INDEX.test(context.filename.replaceAll('\\', '/')) && hasTypeInformation(services)
    )) {
      return {};
    }
    const checker = services.program.getTypeChecker();
    return {
      Program(node: TSESTree.Program) {
        reportLeaks(context, node, { checker, services });
      },
    };
  },
};
