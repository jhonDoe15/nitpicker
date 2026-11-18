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

const TERMINATED = new Set<string>([
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.VariableDeclaration,
  AST_NODE_TYPES.ImportDeclaration,
  AST_NODE_TYPES.ExportAllDeclaration,
  AST_NODE_TYPES.TSTypeAliasDeclaration,
]);

function isTerminated(statement: TSESTree.ProgramStatement): boolean {
  return statement.type === AST_NODE_TYPES.ExportNamedDeclaration
    ? statement.declaration === null || TERMINATED.has(statement.declaration.type)
    : TERMINATED.has(statement.type);
}

function terminatorOf(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  declarations: readonly TSESTree.ImportDeclaration[],
): string {
  const sample = declarations.at(-1) ?? program.body.find(isTerminated);
  return sample === undefined || sourceCode.getText(sample).endsWith(';') ? ';' : '';
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
  { request, clause }: { readonly request: ImportRequest; readonly clause: string },
): FixPlan | undefined {
  const declarations = importsOf(program);
  const [source] = request.sources;
  if (source === undefined) {
    return undefined;
  }
  const quote = quoteOf(sourceCode, declarations);
  const end = terminatorOf(sourceCode, program, declarations);
  const text = `import ${clause} from ${quote}${source}${quote}${end}`;
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

function isFreeName(program: TSESTree.Program, sourceCode: SourceCode, name: string): boolean {
  const global = globalScopeOf(sourceCode.getScope(program));
  return (
    !declaredBelow(global, name) &&
    !global.through.some((reference) => reference.identifier.name === name)
  );
}

function defaultLocalOf(declaration: TSESTree.ImportDeclaration): string | undefined {
  const specifier = declaration.specifiers.find(
    (each) => each.type === AST_NODE_TYPES.ImportDefaultSpecifier,
  );
  return declaration.importKind === 'type' ? undefined : specifier?.local.name;
}

export function importingDefault(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  request: ImportRequest,
): (ImportEdit & { readonly local: string }) | undefined {
  if (program.sourceType !== 'module') {
    return undefined;
  }
  const existing = importsOf(program)
    .filter(({ source }) => request.sources.includes(source.value))
    .map(defaultLocalOf)
    .find((local) => local !== undefined);
  if (existing !== undefined) {
    return reachesAll(sourceCode, { ...request, name: existing })
      ? { present: true, local: existing }
      : undefined;
  }
  if (!isFreeName(program, sourceCode, request.name)) {
    return undefined;
  }
  const plan = newDeclaration(sourceCode, program, { request, clause: request.name });
  return plan === undefined ? undefined : { present: false, plan, local: request.name };
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
  if (!isFreeName(program, sourceCode, request.name)) {
    return undefined;
  }
  const end = own.map(namedSpecifierEnd).find((value) => value !== undefined);
  if (end !== undefined) {
    return { present: false, plan: inserting(end, `, ${request.name}`) };
  }
  const plan = newDeclaration(sourceCode, program, { request, clause: `{ ${request.name} }` });
  return plan === undefined ? undefined : { present: false, plan };
}
