import { ts } from '../../../typescript-api/typescript-api.mjs';
import { replaceEdit } from '../edits/text-edits.mjs';

function propertyNamed(object, name) {
  return object.properties.find((property) => property.name?.text === name);
}

function lineIndent(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/u.exec(text.slice(lineStart, offset))[0];
}

function removalOf(text, development, entry) {
  const entries = development.properties;
  const index = entries.indexOf(entry);
  if (entries.length === 1) {
    return replaceEdit('', [development.getStart(), development.end], '{}');
  }
  return index === entries.length - 1
    ? replaceEdit('', [entries[index - 1].end, entry.end], '')
    : replaceEdit(
        '',
        [
          entry.getStart() - lineIndent(text, entry.getStart()).length,
          entries[index + 1].getStart() - lineIndent(text, entries[index + 1].getStart()).length,
        ],
        '',
      );
}

function sectionInsertion(text, { developmentProperty, line, indent, eol }) {
  const outer = lineIndent(text, developmentProperty.getStart());
  const at = developmentProperty.getStart() - outer.length;
  const block = `${outer}"dependencies": {${eol}${indent}${line}${eol}${outer}},${eol}`;
  return replaceEdit('', [at, at], block);
}

function memberInsertion(text, { runtime, entry, line, indent, eol }) {
  const object = runtime.initializer;
  if (object.properties.length === 0) {
    const outer = lineIndent(text, runtime.getStart());
    const body = `{${eol}${indent}${line}${eol}${outer}}`;
    return replaceEdit('', [object.getStart(), object.end], body);
  }
  const names = object.properties.map((property) => property.name.text);
  const sorted = names.every((each, at) => at === 0 || names[at - 1] <= each);
  const next = sorted
    ? object.properties.find((property) => property.name.text > entry.name.text)
    : undefined;
  if (next === undefined) {
    const last = object.properties.at(-1);
    return replaceEdit('', [last.end, last.end], `,${eol}${indent}${line}`);
  }
  const at = next.getStart() - lineIndent(text, next.getStart()).length;
  return replaceEdit('', [at, at], `${indent}${line},${eol}`);
}

function insertionOf(text, { runtime, developmentProperty, entry, eol }) {
  const line = `"${entry.name.text}": ${entry.initializer.getText()}`;
  const indent = lineIndent(text, entry.getStart());
  return runtime === undefined
    ? sectionInsertion(text, { developmentProperty, line, indent, eol })
    : memberInsertion(text, { runtime, entry, line, indent, eol });
}

export function moveToDependencies(name, text, packageName) {
  const sourceFile = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSON,
  );
  const root = sourceFile.statements[0]?.expression;
  if (root === undefined || !ts.isObjectLiteralExpression(root)) {
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
    entry === undefined ||
    (runtime !== undefined && !ts.isObjectLiteralExpression(runtime.initializer))
  ) {
    return undefined;
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const edits = [
    removalOf(text, development, entry),
    insertionOf(text, { runtime, developmentProperty, entry, eol }),
  ];
  return edits.map((edit) => ({ ...edit, path: name }));
}
