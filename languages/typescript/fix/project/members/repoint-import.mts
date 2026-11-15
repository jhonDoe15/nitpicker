import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { importSpecifier, keptImport } from '../imports/retarget.mts';
import { referencesTo } from '../model/module-references.mts';
import type { ImporterReference } from '../model/reference-types.mts';
import type {
  FixContext,
  Planned,
  Project,
  ProjectEdit,
  ReplaceEdit,
} from '../typed/project-types.mts';
import { declined, replaceEdit } from '../typed/project-views.mts';

const ts = typescriptApi();

type Repoint = { readonly target: string; readonly symbols: readonly string[] };

function repointEdit(
  context: FixContext,
  project: Project,
  { reference, target, symbols }: Repoint & { readonly reference: ImporterReference },
): Planned<ReplaceEdit> {
  const { importer, kind, node } = reference;
  const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
  const bindings = clause?.namedBindings;
  if (
    kind !== 'import' ||
    !ts.isImportDeclaration(node) ||
    clause === undefined ||
    bindings === undefined ||
    !ts.isNamedImports(bindings)
  ) {
    return declined(`${importer} refers to the module in a form --fix does not repoint`);
  }
  const moved = bindings.elements.filter((element) =>
    symbols.includes((element.propertyName ?? element.name).text),
  );
  if (moved.length === 0) {
    return { edits: [] };
  }
  if (!context.accepts(importer)) {
    return declined(`${importer} is outside the files --fix covers`);
  }
  const kept = bindings.elements.filter((element) => !moved.includes(element));
  const names = moved.map((element) => element.getText()).join(', ');
  const line = `import { ${names} } from '${importSpecifier(project, importer, target)}';`;
  const text = [keptImport(node, clause, kept), line].filter((part) => part !== '').join('\n');
  return { edits: [replaceEdit(importer, [node.getStart(), node.end], text)] };
}

export function repointImport(
  context: FixContext,
  project: Project,
  { from, target, symbols }: Repoint & { readonly from: string },
): Planned {
  const edits: ProjectEdit[] = [];
  for (const reference of referencesTo(project, from)) {
    const planned = repointEdit(context, project, { reference, target, symbols });
    if (planned.declined !== undefined) {
      return planned;
    }
    edits.push(...planned.edits);
  }
  return { edits };
}
