import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { type PlanRequest, lintRecipe } from '../plan/lint-recipe.mts';
import type { FixContext, Planned, Project, ReplaceEdit } from '../typed/project-types.mts';
import {
  type ImporterReference,
  declined,
  productionScope,
  referencesTo,
  renameEdits,
  replaceEdit,
  verifyEdits,
} from '../typed/project-views.mts';
import {
  type TargetOrigin,
  type WrapperDeclaration,
  importSpecifier,
  removalEdit,
  targetOrigin,
  wrapperDeclaration,
} from '../typed/wrapper-views.mts';
import { keptImport } from '../imports/retarget.mts';

const ts = typescriptApi();

const MESSAGE = /^`([^`]+)` only forwards its parameters to `([^`]+)`/u;
const EXPORTED = /as ([^ ]+) \}`/u;

function inside(
  edit: ReplaceEdit,
  range: { readonly path: string; readonly start: number; readonly end: number },
) {
  return edit.path === range.path && edit.start >= range.start && edit.end <= range.end;
}

type ImporterRequest = {
  readonly importer: string;
  readonly node: TypeScript.ImportDeclaration;
  readonly element: TypeScript.ImportSpecifier;
  readonly origin: TargetOrigin;
};

function importerEdits(
  context: FixContext,
  project: Project,
  { importer, node, element, origin }: ImporterRequest,
): Planned<ReplaceEdit> {
  const renamed = renameEdits(project, {
    name: importer,
    offset: element.name.getStart(),
    newName: origin.imported,
    accepts: context.accepts,
  });
  if (renamed.declined !== undefined) {
    return renamed;
  }
  const clause = element.parent.parent;
  const kept = element.parent.elements.filter((candidate) => candidate !== element);
  const declaration = { path: importer, start: node.getStart(), end: node.end };
  const uses = renamed.edits.filter((edit) => edit.path === importer && !inside(edit, declaration));
  const rebuilt = keptImport(node, clause, kept);
  const added = `import { ${origin.imported} } from '${importSpecifier(project, importer, origin.module)}';`;
  const text =
    origin.module === importer ? rebuilt : `${rebuilt}${rebuilt === '' ? '' : '\n'}${added}`;
  return { edits: [replaceEdit(importer, [declaration.start, declaration.end], text), ...uses] };
}

type CallerRequest = {
  readonly wrapper: { readonly path: string; readonly exported: string };
  readonly origin: TargetOrigin;
};

function callerEdit(
  context: FixContext,
  project: Project,
  { reference, wrapper, origin }: CallerRequest & { readonly reference: ImporterReference },
): Planned<ReplaceEdit> {
  const { importer, kind } = reference;
  const node = ts.isImportDeclaration(reference.node) ? reference.node : undefined;
  const bindings = node?.importClause?.namedBindings;
  const element =
    bindings !== undefined && ts.isNamedImports(bindings)
      ? bindings.elements.find((each) => (each.propertyName ?? each.name).text === wrapper.exported)
      : undefined;
  if (kind === 'import' && node !== undefined && element !== undefined) {
    return importerEdits(context, project, { importer, node, element, origin });
  }
  const opaque =
    kind !== 'import' || node?.importClause?.name !== undefined || bindings !== undefined;
  return opaque
    ? declined(`${importer} refers to the wrapper in a form --fix does not retarget`)
    : { edits: [] };
}

function callerEdits(
  context: FixContext,
  project: Project,
  { wrapper, origin }: CallerRequest,
): Planned<ReplaceEdit> {
  const edits: ReplaceEdit[] = [];
  for (const reference of referencesTo(project, wrapper.path)) {
    const planned = callerEdit(context, project, { reference, wrapper, origin });
    if (planned.declined !== undefined) {
      return planned;
    }
    edits.push(...planned.edits);
  }
  return { edits };
}

function ownEdits(
  context: FixContext,
  project: Project,
  {
    name,
    declaration,
    origin,
  }: { name: string; declaration: WrapperDeclaration; origin: TargetOrigin },
): Planned<ReplaceEdit> {
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

function planMessage({ context, project, name, message }: PlanRequest): Planned | undefined {
  const [, wrapperName] = MESSAGE.exec(message.message) ?? [];
  const declaration =
    wrapperName === undefined
      ? undefined
      : wrapperDeclaration(project.sourceFile(name), wrapperName);
  const origin =
    declaration === undefined ? undefined : targetOrigin(project, { name, fn: declaration.fn });
  if (declaration === undefined || origin === undefined) {
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
  const edits = [...own.edits, ...(callers.edits ?? [])];
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
