import { ts } from '../../../typescript-api/typescript-api.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';
import { importSpecifier } from '../imports/retarget.mjs';
import { referencesTo } from '../model/module-references.mjs';

function rebuilt(node, kept, line) {
  const clause = node.importClause;
  const head = clause.isTypeOnly ? 'import type ' : 'import ';
  const parts = [
    ...(clause.name === undefined ? [] : [clause.name.text]),
    ...(kept.length === 0 ? [] : [`{ ${kept.map((each) => each.getText()).join(', ')} }`]),
  ];
  const own =
    parts.length === 0
      ? ''
      : `${head}${parts.join(', ')} from ${node.moduleSpecifier.getText()};\n`;
  return `${own}${line}`;
}

function repointEdit(context, project, { reference, target, symbols }) {
  const { importer, kind, node } = reference;
  const bindings = node.importClause?.namedBindings;
  if (kind !== 'import' || bindings === undefined || !ts.isNamedImports(bindings)) {
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
  return { edits: [replaceEdit(importer, [node.getStart(), node.end], rebuilt(node, kept, line))] };
}

export function repointImport(context, project, { from, target, symbols }) {
  const edits = [];
  for (const reference of referencesTo(project, from)) {
    const planned = repointEdit(context, project, { reference, target, symbols });
    if (planned.declined !== undefined) {
      return planned;
    }
    edits.push(...planned.edits);
  }
  return { edits };
}
