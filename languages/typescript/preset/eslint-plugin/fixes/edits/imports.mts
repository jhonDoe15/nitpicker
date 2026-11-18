import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { visibleVariable } from '../support/scope.mts';
import { declaredBelow, globalScopeOf } from './names.mts';
import { inserting, type FixPlan } from '../support/ranges.mts';

export type ImportRequest = {
  readonly sources: readonly string[];
  readonly name: string;
  readonly sites: readonly TSESTree.Node[];
};

export type ImportEdit =
  { readonly present: true } | { readonly present: false; readonly plan: FixPlan };

function importsOf(program: TSESTree.Program): TSESTree.ImportDeclaration[] {
  return program.body.filter(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration,
  );
}

function importedName(specifier: TSESTree.ImportClause): string | undefined {
  if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
    return undefined;
  }
  const { imported } = specifier;
  return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
}

function bindsName(declaration: TSESTree.ImportDeclaration, name: string): boolean {
  return (
    declaration.importKind !== 'type' &&
    declaration.specifiers.some(
      (specifier) =>
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind !== 'type' &&
        importedName(specifier) === name &&
        specifier.local.name === name,
    )
  );
}

function namedSpecifierEnd(declaration: TSESTree.ImportDeclaration): number | undefined {
  if (declaration.importKind === 'type') {
    return undefined;
  }
  const named = declaration.specifiers.filter(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
  );
  return named.at(-1)?.range[1];
}

function quoteOf(
  sourceCode: SourceCode,
  declarations: readonly TSESTree.ImportDeclaration[],
): string {
  const first = declarations[0];
  return first === undefined ? "'" : sourceCode.getText(first.source).charAt(0);
}

function statementStart(sourceCode: SourceCode, program: TSESTree.Program): number | undefined {
  const directives = program.body.filter(
    (statement) => statement.type === AST_NODE_TYPES.ExpressionStatement && statement.directive,
  );
  const last = directives.at(-1);
  if (last !== undefined) {
    return last.range[1];
  }
  const first = program.body[0];
  if (first === undefined) {
    return undefined;
  }
  return sourceCode.getCommentsBefore(first).length > 0 ? undefined : first.range[0];
}

function newDeclaration(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  { sources, name }: ImportRequest,
): FixPlan | undefined {
  const declarations = importsOf(program);
  const [source] = sources;
  if (source === undefined) {
    return undefined;
  }
  const quote = quoteOf(sourceCode, declarations);
  const text = `import { ${name} } from ${quote}${source}${quote};`;
  const last = declarations.at(-1);
  if (last !== undefined) {
    return inserting(last.range[1], `\n${text}`);
  }
  const start = statementStart(sourceCode, program);
  if (start === undefined) {
    return undefined;
  }
  return start === program.body[0]?.range[0]
    ? inserting(start, `${text}\n`)
    : inserting(start, `\n${text}`);
}

function reachesAll(sourceCode: SourceCode, { name, sites }: ImportRequest): boolean {
  return sites.every((site) =>
    visibleVariable(sourceCode, site, name)?.defs.every(({ type }) => type === 'ImportBinding'),
  );
}

export function importingName(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  request: ImportRequest,
): ImportEdit | undefined {
  if (program.sourceType !== 'module') {
    return undefined;
  }
  const own = importsOf(program).filter(({ source }) => request.sources.includes(source.value));
  if (own.some((declaration) => bindsName(declaration, request.name))) {
    return reachesAll(sourceCode, request) ? { present: true } : undefined;
  }
  const global = globalScopeOf(sourceCode.getScope(program));
  const free =
    !declaredBelow(global, request.name) &&
    !global.through.some((reference) => reference.identifier.name === request.name);
  if (!free) {
    return undefined;
  }
  const end = own.map(namedSpecifierEnd).find((value) => value !== undefined);
  if (end !== undefined) {
    return { present: false, plan: inserting(end, `, ${request.name}`) };
  }
  const plan = newDeclaration(sourceCode, program, request);
  return plan === undefined ? undefined : { present: false, plan };
}
