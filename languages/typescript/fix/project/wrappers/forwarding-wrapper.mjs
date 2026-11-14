import { ts } from '../../../typescript-api/typescript-api.mjs';
import { renameEdits } from '../edits/symbol-rename.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { importSpecifier } from '../imports/retarget.mjs';
import { removalEdit } from '../reuse/declarations.mjs';
import { referencesTo } from '../model/module-references.mjs';
import { productionScope } from '../model/project-model.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';
import { targetOrigin, wrapperDeclaration } from './wrapper-target.mjs';

const MESSAGE = /^`([^`]+)` only forwards its parameters to `([^`]+)`/u;
const EXPORTED = /as ([^ ]+) \}`/u;

function inside(edit, range) {
  return edit.path === range.path && edit.start >= range.start && edit.end <= range.end;
}

function importerEdits(context, project, { importer, node, element, origin }) {
  const renamed = renameEdits(project, {
    name: importer,
    offset: element.name.getStart(),
    newName: origin.imported,
    accepts: context.accepts,
  });
  if (renamed.declined !== undefined) {
    return renamed;
  }
  const clause = node.importClause;
  const kept = clause.namedBindings.elements.filter((candidate) => candidate !== element);
  const declaration = { path: importer, start: node.getStart(), end: node.end };
  const uses = renamed.edits.filter((edit) => edit.path === importer && !inside(edit, declaration));
  const head = clause.isTypeOnly ? 'import type ' : 'import ';
  const parts = [
    ...(clause.name === undefined ? [] : [clause.name.text]),
    ...(kept.length === 0 ? [] : [`{ ${kept.map((each) => each.getText()).join(', ')} }`]),
  ];
  const from = node.moduleSpecifier.getText();
  const rebuilt = parts.length === 0 ? '' : `${head}${parts.join(', ')} from ${from};`;
  const added = `import { ${origin.imported} } from '${importSpecifier(project, importer, origin.module)}';`;
  const text =
    origin.module === importer ? rebuilt : `${rebuilt}${rebuilt === '' ? '' : '\n'}${added}`;
  return { edits: [replaceEdit(importer, [declaration.start, declaration.end], text), ...uses] };
}

function callerEdit(context, project, { reference, wrapper, origin }) {
  const { importer, kind, node } = reference;
  const bindings = node.importClause?.namedBindings;
  const element =
    bindings !== undefined && ts.isNamedImports(bindings)
      ? bindings.elements.find((each) => (each.propertyName ?? each.name).text === wrapper.exported)
      : undefined;
  if (kind === 'import' && element !== undefined) {
    return importerEdits(context, project, { importer, node, element, origin });
  }
  const opaque =
    kind !== 'import' || node.importClause?.name !== undefined || bindings !== undefined;
  return opaque
    ? declined(`${importer} refers to the wrapper in a form --fix does not retarget`)
    : { edits: [] };
}

function callerEdits(context, project, { wrapper, origin }) {
  const edits = [];
  for (const reference of referencesTo(project, wrapper.path)) {
    const planned = callerEdit(context, project, { reference, wrapper, origin });
    if (planned.declined !== undefined) {
      return planned;
    }
    edits.push(...planned.edits);
  }
  return { edits };
}

function ownEdits(context, project, { name, declaration, origin }) {
  const renamed = renameEdits(project, {
    name,
    offset: declaration.nameNode.getStart(),
    newName: origin.local,
    accepts: context.accepts,
  });
  if (renamed.declined !== undefined) {
    return renamed;
  }
  const statement = {
    path: name,
    start: declaration.statement.getStart(),
    end: declaration.statement.end,
  };
  const uses = renamed.edits.filter((edit) => edit.path === name && !inside(edit, statement));
  return { edits: [removalEdit(name, declaration.statement), ...uses] };
}

function planMessage({ context, project, name, message }) {
  const [, wrapperName] = MESSAGE.exec(message.message) ?? [];
  const declaration =
    wrapperName === undefined
      ? undefined
      : wrapperDeclaration(project.sourceFile(name), wrapperName);
  const origin =
    declaration === undefined ? undefined : targetOrigin(project, { name, fn: declaration.fn });
  if (origin === undefined) {
    return declined(
      'the target is not a named import or a named export --fix can point callers at',
    );
  }
  const exported =
    message.messageId === 'forwardingWrapper' ? EXPORTED.exec(message.message)?.[1] : undefined;
  const callers =
    exported === undefined
      ? { edits: [] }
      : callerEdits(context, project, { wrapper: { path: name, exported }, origin });
  const own =
    callers.declined === undefined
      ? ownEdits(context, project, { name, declaration, origin })
      : callers;
  if (own.declined !== undefined) {
    return own;
  }
  const edits = [...own.edits, ...callers.edits];
  const unsafe = verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : declined(unsafe);
}

export const noForwardingWrapperRecipe = lintRecipe({
  id: 'typescript-no-forwarding-wrapper',
  ruleId: 'no-forwarding-wrapper',
  typed: true,
  scopeOf: (context) => productionScope(context.inputs),
  planMessage,
});
