import {
  isJsdocBlock,
  jsdocOptionSchema,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';

const DEPRECATED_TAG = /^[\s*]*@deprecated\b/mu;
const DECLARATION_NAMES = {
  FunctionDeclaration: (declaration) => [declaration.id?.name],
  ClassDeclaration: (declaration) => [declaration.id?.name],
  TSTypeAliasDeclaration: (declaration) => [declaration.id.name],
  TSEnumDeclaration: (declaration) => [declaration.id.name],
  VariableDeclaration: (declaration) =>
    declaration.declarations.map(({ id }) => (id.type === 'Identifier' ? id.name : undefined)),
};

function declaredNames(declaration) {
  return (DECLARATION_NAMES[declaration?.type]?.(declaration) ?? []).filter(
    (name) => name !== undefined,
  );
}

function exportedNamesOf(program) {
  return new Set(
    program.body.flatMap((statement) => {
      if (statement.type !== 'ExportNamedDeclaration') {
        return [];
      }
      return statement.source === null && statement.declaration === null
        ? statement.specifiers.map(({ local }) => local.name)
        : declaredNames(statement.declaration);
    }),
  );
}

function aliasOf(declaration) {
  if (declaration?.type === 'TSTypeAliasDeclaration') {
    const { typeAnnotation } = declaration;
    const plain =
      typeAnnotation.type === 'TSTypeReference' &&
      typeAnnotation.typeName.type === 'Identifier' &&
      typeAnnotation.typeArguments === undefined &&
      declaration.typeParameters === undefined;
    return plain ? { alias: declaration.id.name, target: typeAnnotation.typeName.name } : undefined;
  }
  const [only] = declaration?.type === 'VariableDeclaration' ? declaration.declarations : [];
  const plain =
    only !== undefined &&
    declaration.declarations.length === 1 &&
    only.id.type === 'Identifier' &&
    only.init?.type === 'Identifier';
  return plain ? { alias: only.id.name, target: only.init.name } : undefined;
}

function reportDeprecatedTags(context) {
  const deprecated = context.sourceCode
    .getAllComments()
    .filter((comment) => isJsdocBlock(comment) && DEPRECATED_TAG.test(comment.value));
  for (const comment of deprecated) {
    context.report({ loc: comment.loc, messageId: 'deprecatedTag' });
  }
}

function reportAliases(context, program) {
  const exported = exportedNamesOf(program);
  const aliases = program.body
    .filter((statement) => statement.type === 'ExportNamedDeclaration')
    .map((statement) => ({ statement, found: aliasOf(statement.declaration) }))
    .filter(
      ({ found }) =>
        found !== undefined && found.alias !== found.target && exported.has(found.target),
    );
  for (const { statement, found } of aliases) {
    context.report({ node: statement, messageId: 'aliasExport', data: found });
  }
}

export const rule = {
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
    const tagsHandledByComments = context.options[0]?.jsdoc === true;
    return {
      Program(program) {
        if (!tagsHandledByComments) {
          reportDeprecatedTags(context);
        }
        reportAliases(context, program);
      },
    };
  },
};
