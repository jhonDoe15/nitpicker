import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { lintRecipe, type PlanRequest } from '../plan/lint-recipe.mts';
import type { Planned, ReplaceEdit } from '../typed/project-types.mts';
import {
  declined,
  productionScope,
  renameEdits,
  replaceEdit,
  symbolReferenceProblem,
  verifyEdits,
} from '../typed/project-views.mts';

type Removal = { readonly nameNode: TypeScript.Node; readonly edit: ReplaceEdit };

const ts = typescriptApi();

function isNode(value: unknown): value is TypeScript.Node {
  return typeof value === 'object' && value !== null && 'kind' in value && 'pos' in value;
}

const ALIAS = /^`([^`]+)` is a second exported name for `([^`]+)`/u;

function statementEnd(text: string, statement: TypeScript.Node): number {
  return text[statement.end] === '\n' ? statement.end + 1 : statement.end;
}

function namedNode(value: unknown): TypeScript.Node | undefined {
  return isNode(value) ? value : undefined;
}

function declaredNameOf(statement: TypeScript.Statement): TypeScript.Node | undefined {
  if (ts.isExportDeclaration(statement)) {
    return undefined;
  }
  return ts.isVariableStatement(statement)
    ? statement.declarationList.declarations[0]?.name
    : namedNode(fieldOf(statement, 'name') ?? fieldOf(fieldOf(statement, 'declaration'), 'name'));
}

function statementRemoval(
  name: string,
  sourceFile: TypeScript.SourceFile,
  statement: TypeScript.Statement,
): Removal | undefined {
  const nameNode = declaredNameOf(statement);
  if (nameNode === undefined) {
    return undefined;
  }
  const end = statementEnd(sourceFile.text, statement);
  return { nameNode, edit: replaceEdit(name, [statement.getStart(), end], '') };
}

function specifierRemoval(
  name: string,
  sourceFile: TypeScript.SourceFile,
  start: number,
): Removal | undefined {
  const { text } = sourceFile;
  for (const candidate of sourceFile.statements.filter(ts.isExportDeclaration)) {
    const clause = candidate.exportClause;
    const elements = clause !== undefined && ts.isNamedExports(clause) ? clause.elements : [];
    const specifier = elements.find((element) => element.getStart() === start);
    if (specifier === undefined || candidate.moduleSpecifier !== undefined) {
      continue;
    }
    const kept = elements.filter((element) => element !== specifier).map((e) => e.getText());
    const head = candidate.isTypeOnly ? 'export type' : 'export';
    const replacement = kept.length === 0 ? '' : `${head} { ${kept.join(', ')} };`;
    const end = kept.length === 0 ? statementEnd(text, candidate) : candidate.end;
    return {
      nameNode: specifier.name,
      edit: replaceEdit(name, [candidate.getStart(), end], replacement),
    };
  }
  return undefined;
}

function removalOf(
  name: string,
  sourceFile: TypeScript.SourceFile,
  start: number,
): Removal | undefined {
  const statement = sourceFile.statements.find((candidate) => candidate.getStart() === start);
  return statement === undefined
    ? specifierRemoval(name, sourceFile, start)
    : statementRemoval(name, sourceFile, statement);
}

function insideRemoval(edit: ReplaceEdit, removal: ReplaceEdit): boolean {
  return edit.path === removal.path && edit.start >= removal.start && edit.end <= removal.end;
}

function planMessage({ context, project, name, message }: PlanRequest): Planned | undefined {
  const [, alias, target] = ALIAS.exec(message.message) ?? [];
  if (message.messageId !== 'aliasExport' || alias === undefined || target === undefined) {
    return undefined;
  }
  const sourceFile = project.sourceFile(name);
  const removal = sourceFile === undefined ? undefined : removalOf(name, sourceFile, message.start);
  if (removal === undefined) {
    return declined('the alias has a form --fix does not rewrite');
  }
  const renamed = renameEdits(project, {
    name,
    offset: removal.nameNode.getStart(),
    newName: target,
    accepts: context.accepts,
  });
  if (renamed.declined !== undefined) {
    return renamed;
  }
  const edits = [
    removal.edit,
    ...renamed.edits.filter((edit) => !insideRemoval(edit, removal.edit)),
  ];
  const problem = symbolReferenceProblem(project, { target: name, exportName: alias });
  const unsafe = problem ?? verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : { declined: unsafe };
}

export const noCompatibilityShimRecipe = lintRecipe({
  id: 'typescript-no-compatibility-shim',
  ruleId: 'no-compatibility-shim',
  exclusive: true,
  scopeOf: (context) => productionScope(context.inputs),
  planMessage,
});
