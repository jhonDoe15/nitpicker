import { ts } from '../../../typescript-api/typescript-api.mjs';
import { renameEdits } from '../edits/symbol-rename.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';
import { symbolReferenceProblem } from '../edits/declines.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';
import { productionScope } from '../model/project-model.mjs';

const ALIAS = /^`([^`]+)` is a second exported name for `([^`]+)`/u;

function statementEnd(text, statement) {
  return text[statement.end] === '\n' ? statement.end + 1 : statement.end;
}

function declaredNameOf(statement) {
  if (ts.isExportDeclaration(statement)) {
    return undefined;
  }
  return ts.isVariableStatement(statement)
    ? statement.declarationList.declarations[0].name
    : (statement.name ?? statement.declaration?.name);
}

function statementRemoval(name, sourceFile, statement) {
  const nameNode = declaredNameOf(statement);
  if (nameNode === undefined) {
    return undefined;
  }
  const end = statementEnd(sourceFile.text, statement);
  return { nameNode, edit: replaceEdit(name, [statement.getStart(), end], '') };
}

function specifierRemoval(name, sourceFile, start) {
  const { text } = sourceFile;
  for (const candidate of sourceFile.statements.filter(ts.isExportDeclaration)) {
    const elements = candidate.exportClause?.elements ?? [];
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

function removalOf(name, sourceFile, start) {
  const statement = sourceFile.statements.find((candidate) => candidate.getStart() === start);
  return statement === undefined
    ? specifierRemoval(name, sourceFile, start)
    : statementRemoval(name, sourceFile, statement);
}

function insideRemoval(edit, removal) {
  return edit.path === removal.path && edit.start >= removal.start && edit.end <= removal.end;
}

function planMessage({ context, project, name, message }) {
  const [, alias, target] = ALIAS.exec(message.message) ?? [];
  if (message.messageId !== 'aliasExport' || alias === undefined) {
    return undefined;
  }
  const removal = removalOf(name, project.sourceFile(name), message.start);
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
