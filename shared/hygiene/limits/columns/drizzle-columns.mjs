import { makeFact } from '../scanning/facts.mjs';
import { blankComments, closingIndex, lineAt, splitTopLevel } from '../scanning/scan.mjs';

const TABLE =
  /(?:\b(\w+)\s*=\s*)?\b(?:pg|mysql|sqlite|singlestore)Table\(\s*['"](\w+)['"]\s*,\s*\{/gu;
const PROPERTY =
  /^\s*(\w+)\s*:\s*(?:varchar|char)\(\s*(?:['"](\w+)['"]\s*,\s*)?\{[^}]*\blength\s*:\s*(\d+)/u;

export function drizzleColumnFacts(file, source) {
  const text = blankComments(source);
  return [...text.matchAll(TABLE)].flatMap((table) => {
    const open = table.index + table[0].length - 1;
    const body = text.slice(open + 1, closingIndex(text, open));
    return splitTopLevel(body).flatMap(({ text: property, offset }) => {
      const column = PROPERTY.exec(property);
      return column === null
        ? []
        : [
            makeFact({
              kind: 'column',
              entityNames: [table[1], table[2]],
              fieldNames: [column[1], column[2]],
              label: `${table[1] ?? table[2]}.${column[1]}`,
              file,
              line: lineAt(text, open + 1 + offset + property.search(/\S/u)),
              style: 'drizzle',
              width: Number(column[3]),
            }),
          ];
    });
  });
}
