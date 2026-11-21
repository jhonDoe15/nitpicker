// Writes what the Node structure analyzer reports for a list of files, for comparison with
// `nitpicker-engine typescript-structure --files <list>`.
// Usage: node engine/parity/typescript-structure-expected.mts <list> <out.json>
// Each line of the list is the path to read, a tab, and the path to report.
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeSource } from '../../languages/typescript/preset/structure/analyze.mts';

const [list, out] = process.argv.slice(2);
if (list === undefined || out === undefined) {
  throw new Error('usage: typescript-structure-expected.mts <list> <out.json>');
}
const functions = [];
const classes = [];
const unparsed = [];
let lines = 0;
const files = readFileSync(list, 'utf8')
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => line.split('\t'));
for (const [file, display = file] of files) {
  try {
    const analysis = analyzeSource(readFileSync(file, 'utf8'), display);
    lines += analysis.lines;
    functions.push(...analysis.functions);
    classes.push(...analysis.classes);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    unparsed.push({ file: display, reason: error.message });
  }
}
const summary = { files: files.length, lines, functions: functions.length, classes: classes.length };
writeFileSync(out, JSON.stringify({ summary, functions, classes, unparsed }));
