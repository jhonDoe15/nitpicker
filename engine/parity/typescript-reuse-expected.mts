// Writes what the Node structure analyzer reads from each listed file for the duplicate and reuse rules,
// one JSON line per file, for comparison with `nitpicker-engine typescript-reuse --files <list>`.
// Usage: node engine/parity/typescript-reuse-expected.mts <list> <out.jsonl>
// Each line of the list is the path to read, a tab, and the path to report.
// Imported names in the unit trees keep their module specifier: resolving it to a module is left to the caller.
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { nearDuplicateUnits } from '../../languages/typescript/preset/structure/reuse/near-duplicates/units.mts';
import { fileDefinitions } from '../../languages/typescript/preset/structure/reuse/syntax/definitions.mts';
import {
  fileDynamicImports,
  fileExports,
  fileImports,
} from '../../languages/typescript/preset/syntax/module-facts.mts';
import {
  jsxTagNames,
  referencePositions,
} from '../../languages/typescript/preset/syntax/references.mts';

const [list, out] = process.argv.slice(2);
if (list === undefined || out === undefined) {
  throw new Error('usage: typescript-reuse-expected.mts <list> <out.jsonl>');
}
const lines = readFileSync(list, 'utf8')
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => line.split('\t'))
  .map(([file, display = file]) => {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const references = referencePositions(sourceFile);
    const definitions = fileDefinitions(sourceFile).map(({ span, tokens, ...definition }) => ({
      ...definition,
      usedLocally: (references.get(definition.name) ?? []).some(
        (at) => at < span[0] || at >= span[1],
      ),
    }));
    return JSON.stringify({
      path: display,
      definitions,
      imports: fileImports(sourceFile),
      dynamicImports: fileDynamicImports(sourceFile),
      exports: fileExports(sourceFile),
      jsxTags: [...jsxTagNames(sourceFile)].toSorted(),
      nearDuplicateUnits: nearDuplicateUnits(sourceFile, display),
    });
  });
writeFileSync(out, lines.map((line) => `${line}\n`).join(''));
