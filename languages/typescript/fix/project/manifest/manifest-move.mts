import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { replaceEdit } from '../edits/text-edits.mts';
import type { ProjectEdit } from '../typed/project-types.mts';

type Entry = TypeScript.PropertyAssignment;
type Insertion = { readonly line: string; readonly indent: string; readonly eol: string };

const ts = typescriptApi();

function keyOf(property: TypeScript.ObjectLiteralElementLike): string {
  return ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name)
    ? property.name.text
    : '';
}

function entriesOf(object: TypeScript.ObjectLiteralExpression): Entry[] {
  return object.properties.filter((property) => ts.isPropertyAssignment(property));
}

function propertyNamed(
  object: TypeScript.ObjectLiteralExpression,
  name: string,
): Entry | undefined {
  return entriesOf(object).find((property) => keyOf(property) === name);
}

function lineIndent(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/u.exec(text.slice(lineStart, offset))?.[0] ?? '';
}

function removalOf(
  text: string,
  development: TypeScript.ObjectLiteralExpression,
  entry: Entry,
): ProjectEdit {
  const entries = entriesOf(development);
  const index = entries.indexOf(entry);
  if (entries.length === 1) {
    return replaceEdit('', [development.getStart(), development.end], '{}');
  }
  const previous = entries[index - 1];
  const following = entries[index + 1];
  return following === undefined
    ? replaceEdit('', [previous?.end ?? entry.getStart(), entry.end], '')
    : replaceEdit(
        '',
        [
          entry.getStart() - lineIndent(text, entry.getStart()).length,
          following.getStart() - lineIndent(text, following.getStart()).length,
        ],
        '',
      );
}

function sectionInsertion(
  text: string,
  { developmentProperty, line, indent, eol }: Insertion & { developmentProperty: Entry },
): ProjectEdit {
  const outer = lineIndent(text, developmentProperty.getStart());
  const at = developmentProperty.getStart() - outer.length;
  const block = `${outer}"dependencies": {${eol}${indent}${line}${eol}${outer}},${eol}`;
  return replaceEdit('', [at, at], block);
}

function sortedSuccessor(properties: readonly Entry[], entry: Entry): Entry | undefined {
  const names = properties.map(keyOf);
  const sorted = names.every((each, at) => at === 0 || (names[at - 1] ?? '') <= each);
  return sorted ? properties.find((property) => keyOf(property) > keyOf(entry)) : undefined;
}

function memberInsertion(
  text: string,
  { runtime, entry, line, indent, eol }: Insertion & { runtime: Entry; entry: Entry },
): ProjectEdit | undefined {
  const object = runtime.initializer;
  if (!ts.isObjectLiteralExpression(object)) {
    return undefined;
  }
  const properties = entriesOf(object);
  if (properties.length === 0) {
    const outer = lineIndent(text, runtime.getStart());
    const body = `{${eol}${indent}${line}${eol}${outer}}`;
    return replaceEdit('', [object.getStart(), object.end], body);
  }
  const next = sortedSuccessor(properties, entry);
  if (next === undefined) {
    const last = properties.at(-1);
    return last === undefined
      ? undefined
      : replaceEdit('', [last.end, last.end], `,${eol}${indent}${line}`);
  }
  const at = next.getStart() - lineIndent(text, next.getStart()).length;
  return replaceEdit('', [at, at], `${indent}${line},${eol}`);
}

function insertionOf(
  text: string,
  {
    runtime,
    developmentProperty,
    entry,
    eol,
  }: { runtime: Entry | undefined; developmentProperty: Entry; entry: Entry; eol: string },
): ProjectEdit | undefined {
  const line = `"${keyOf(entry)}": ${entry.initializer.getText()}`;
  const indent = lineIndent(text, entry.getStart());
  return runtime === undefined
    ? sectionInsertion(text, { developmentProperty, line, indent, eol })
    : memberInsertion(text, { runtime, entry, line, indent, eol });
}

function manifestRoot(name: string, text: string): TypeScript.ObjectLiteralExpression | undefined {
  const sourceFile = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSON,
  );
  const [first] = sourceFile.statements;
  const root =
    first !== undefined && ts.isExpressionStatement(first) ? first.expression : undefined;
  return root !== undefined && ts.isObjectLiteralExpression(root) ? root : undefined;
}

export function moveToDependencies(
  name: string,
  text: string,
  packageName: string,
): ProjectEdit[] | undefined {
  const root = manifestRoot(name, text);
  if (root === undefined) {
    return undefined;
  }
  const developmentProperty = propertyNamed(root, 'devDependencies');
  const development = developmentProperty?.initializer;
  const entry =
    development === undefined || !ts.isObjectLiteralExpression(development)
      ? undefined
      : propertyNamed(development, packageName);
  const runtime = propertyNamed(root, 'dependencies');
  if (
    development === undefined ||
    !ts.isObjectLiteralExpression(development) ||
    developmentProperty === undefined ||
    entry === undefined ||
    (runtime !== undefined && !ts.isObjectLiteralExpression(runtime.initializer))
  ) {
    return undefined;
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const insertion = insertionOf(text, { runtime, developmentProperty, entry, eol });
  if (insertion === undefined) {
    return undefined;
  }
  return [removalOf(text, development, entry), insertion].map((edit) => ({ ...edit, path: name }));
}
