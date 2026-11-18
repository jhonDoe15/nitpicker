import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment, withOwnLines } from '../text-ranges.mts';

type Import = TSESTree.ImportDeclaration;
type Parts = { readonly defaults: readonly string[]; readonly named: readonly string[] };

function sliceOf(text: string, node: TSESTree.Node): string {
  return text.slice(...node.range);
}

function partsOf(text: string, declaration: Import): Parts | undefined {
  if (declaration.specifiers.some(({ type }) => type === AST_NODE_TYPES.ImportNamespaceSpecifier)) {
    return undefined;
  }
  return {
    defaults: declaration.specifiers
      .filter(({ type }) => type === AST_NODE_TYPES.ImportDefaultSpecifier)
      .map((specifier) => sliceOf(text, specifier)),
    named: declaration.specifiers
      .filter(({ type }) => type === AST_NODE_TYPES.ImportSpecifier)
      .map((specifier) => sliceOf(text, specifier)),
  };
}

function attributesOf(text: string, declaration: Import): string {
  return declaration.attributes.map((attribute) => sliceOf(text, attribute)).join(', ');
}

function firstImport(later: Import): Import | undefined {
  const program = later.parent;
  return program.type === AST_NODE_TYPES.Program
    ? program.body.find(
        (statement): statement is Import =>
          statement.type === AST_NODE_TYPES.ImportDeclaration &&
          statement !== later &&
          statement.range[0] < later.range[0] &&
          statement.source.value === later.source.value &&
          statement.importKind === later.importKind,
      )
    : undefined;
}

function mergedText(text: string, first: Import, parts: Parts): string {
  const clauses = [
    ...parts.defaults,
    ...(parts.named.length === 0 ? [] : [`{ ${parts.named.join(', ')} }`]),
  ];
  const kind = first.importKind === 'type' ? 'import type ' : 'import ';
  const attributes = first.attributes.length === 0 ? '' : ` with { ${attributesOf(text, first)} }`;
  const from = clauses.length === 0 ? '' : `${clauses.join(', ')} from `;
  const semicolon = sliceOf(text, first).endsWith(';') ? ';' : '';
  return `${kind}${from}${sliceOf(text, first.source)}${attributes}${semicolon}`;
}

function merged({ text, sourceCode, node }: CoreRequest): CorePlan {
  const later = node.type === AST_NODE_TYPES.ImportDeclaration ? node : undefined;
  const first = later === undefined ? undefined : firstImport(later);
  if (later === undefined || first === undefined) {
    return { declined: 'the earlier import of the module was not found' };
  }
  const firstParts = partsOf(text, first);
  const laterParts = partsOf(text, later);
  if (firstParts === undefined || laterParts === undefined) {
    return { declined: 'a namespace import cannot take other specifiers' };
  }
  const defaults = [...new Set([...firstParts.defaults, ...laterParts.defaults])];
  if (defaults.length > 1 || attributesOf(text, first) !== attributesOf(text, later)) {
    return { declined: 'the imports have two default names or different attributes' };
  }
  const [firstStart, firstEnd] = first.range;
  const [laterStart, laterEnd] = later.range;
  if (
    hasComment(sourceCode, { start: firstStart, end: firstEnd }) ||
    hasComment(sourceCode, { start: laterStart, end: laterEnd }) ||
    sourceCode.getCommentsBefore(later).length > 0
  ) {
    return { declined: 'a comment sits inside an import' };
  }
  const parts = { defaults, named: [...new Set([...firstParts.named, ...laterParts.named])] };
  return {
    edits: [
      { start: firstStart, end: firstEnd, text: mergedText(text, first, parts) },
      { ...withOwnLines(text, { start: laterStart, end: laterEnd }), text: '' },
    ],
  };
}

export const duplicateImportsRecipe = coreRuleRecipe({
  id: 'typescript-no-duplicate-imports',
  rule: 'no-duplicate-imports',
  options: [{ allowSeparateTypeImports: true }],
  plan: merged,
});
