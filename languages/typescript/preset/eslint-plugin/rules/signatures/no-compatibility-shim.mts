import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isJsdocBlock, jsdocOptionSchema, type JsdocOptions } from '../typed/jsdoc-views.mts';
import { nameOf } from '../typed/node-views.mts';

type MessageIds = 'deprecatedTag' | 'aliasExport';
type Context = Readonly<TSESLint.RuleContext<MessageIds, JsdocOptions>>;
type Found = { readonly alias: string; readonly target: string | undefined };

const DEPRECATED_TAG = /^[\s*]*@deprecated\b/mu;
function declaredNames(declaration: TSESTree.Node | undefined): string[] {
  if (
    declaration?.type === AST_NODE_TYPES.FunctionDeclaration ||
    declaration?.type === AST_NODE_TYPES.ClassDeclaration
  ) {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  if (
    declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
    declaration?.type === AST_NODE_TYPES.TSEnumDeclaration
  ) {
    return [declaration.id.name];
  }
  if (declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
    return declaration.declarations.flatMap(({ id }) =>
      id.type === AST_NODE_TYPES.Identifier ? [id.name] : [],
    );
  }
  return [];
}

function exportedName(specifier: TSESTree.ExportSpecifier): string {
  const { exported } = specifier;
  return exported.type === AST_NODE_TYPES.Identifier ? exported.name : exported.value;
}

function isOwnName(specifier: TSESTree.ExportSpecifier): boolean {
  return nameOf(specifier.local) === exportedName(specifier);
}

function specifierAliases(
  statement: TSESTree.ExportNamedDeclaration,
): { readonly node: TSESTree.Node; readonly found: Found }[] {
  if (statement.source !== null || statement.declaration !== null) {
    return [];
  }
  return statement.specifiers
    .filter((specifier) => !isOwnName(specifier) && exportedName(specifier) !== 'default')
    .map((specifier) => ({
      node: specifier,
      found: { alias: exportedName(specifier), target: nameOf(specifier.local) },
    }));
}

function exportedNamesOf(program: TSESTree.Program): Set<string | undefined> {
  return new Set<string | undefined>(
    program.body.flatMap((statement) => {
      if (statement.type !== AST_NODE_TYPES.ExportNamedDeclaration) {
        return [];
      }
      return statement.source === null && statement.declaration === null
        ? statement.specifiers.filter(isOwnName).map(({ local }) => nameOf(local))
        : declaredNames(statement.declaration ?? undefined);
    }),
  );
}

function aliasOf(declaration: TSESTree.Node | undefined): Found | undefined {
  if (declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
    const { typeAnnotation } = declaration;
    return typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
      typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
      typeAnnotation.typeArguments === undefined &&
      declaration.typeParameters === undefined
      ? { alias: declaration.id.name, target: typeAnnotation.typeName.name }
      : undefined;
  }
  if (declaration?.type !== AST_NODE_TYPES.VariableDeclaration) {
    return undefined;
  }
  const [only] = declaration.declarations;
  return declaration.declarations.length === 1 &&
    only.id.type === AST_NODE_TYPES.Identifier &&
    only.init?.type === AST_NODE_TYPES.Identifier
    ? { alias: only.id.name, target: only.init.name }
    : undefined;
}

function reportDeprecatedTags(context: Context): void {
  const deprecated = context.sourceCode
    .getAllComments()
    .filter((comment) => isJsdocBlock(comment) && DEPRECATED_TAG.test(comment.value));
  for (const comment of deprecated) {
    context.report({ loc: comment.loc, messageId: 'deprecatedTag' });
  }
}

function reportAliases(context: Context, program: TSESTree.Program): void {
  const exported = exportedNamesOf(program);
  const exports = program.body.filter(
    (statement): statement is TSESTree.ExportNamedDeclaration =>
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration,
  );
  const declared = exports.map((statement) => ({
    node: statement,
    found: aliasOf(statement.declaration ?? undefined),
  }));
  const aliases = [...declared, ...exports.flatMap(specifierAliases)].flatMap(({ node, found }) =>
    found !== undefined && found.alias !== found.target && exported.has(found.target)
      ? [{ node, found }]
      : [],
  );
  for (const { node, found } of aliases) {
    context.report({ node, messageId: 'aliasExport', data: found });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, JsdocOptions> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow deprecated declarations and second names for an exported API' },
    schema: jsdocOptionSchema,
    messages: {
      deprecatedTag:
        'A `@deprecated` declaration keeps the old API next to its replacement. Delete it and update its callers to the replacement in the same change.',
      aliasExport:
        '`{{ alias }}` is a second exported name for `{{ target }}`. Delete `{{ alias }}` and update its callers to import `{{ target }}`.',
    },
  },
  create(context) {
    const tagsHandledByComments = context.options[0]?.['jsdoc'] === true;
    return {
      Program(program: TSESTree.Program) {
        if (!tagsHandledByComments) {
          reportDeprecatedTags(context);
        }
        reportAliases(context, program);
      },
    };
  },
};
