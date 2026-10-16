import path from 'node:path';
import ts from 'typescript';
import { functionUnits } from '../../preset/structure/units/function-units.mjs';

const SCRIPT_KINDS = new Map([
  ['.tsx', ts.ScriptKind.TSX],
  ['.jsx', ts.ScriptKind.JSX],
  ['.js', ts.ScriptKind.JS],
  ['.mjs', ts.ScriptKind.JS],
  ['.cjs', ts.ScriptKind.JS],
]);
const cache = new Map();

function unitsOf(source, file) {
  const known = cache.get(file);
  if (known?.source === source) {
    return known.units;
  }
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS.get(path.extname(file)) ?? ts.ScriptKind.TS,
  );
  const { units } = functionUnits(sourceFile);
  cache.set(file, { source, units });
  return units;
}

function narrowest(units, line) {
  let found;
  for (const unit of units) {
    const holds = unit.start <= line && line <= unit.end;
    if (holds && (found === undefined || unit.end - unit.start <= found.end - found.start)) {
      found = unit;
    }
  }
  return found?.name;
}

/** The qualified name of the function a CRAP entry measures, found by its first and last line. */
export function crapFunctionName(source, file, { lines }) {
  const functions = unitsOf(source, file).filter(({ kind }) => kind === 'function');
  return (
    functions.find((unit) => unit.start === lines?.start && unit.end === lines?.end) ??
    functions.find((unit) => unit.start === lines?.start)
  )?.name;
}

/** The unit (function, class field initializer or static block) that holds each branch. */
export function branchFunctionNames(source, file, branchMap = {}) {
  const units = unitsOf(source, file);
  return Object.fromEntries(
    Object.entries(branchMap).map(([branchId, branch]) => [
      branchId,
      narrowest(units, branch.loc?.start?.line),
    ]),
  );
}

/** The unit that holds a line, for a mutant. */
export function functionNameAtLine(source, file, line) {
  return narrowest(unitsOf(source, file), line);
}
