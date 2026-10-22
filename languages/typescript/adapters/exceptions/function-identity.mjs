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

function unitsOf(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS.get(path.extname(file)) ?? ts.ScriptKind.TS,
  );
  return functionUnits(sourceFile).units;
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

function crapFunctionName(units, { lines }) {
  const functions = units.filter(({ kind }) => kind === 'function');
  return (
    functions.find((unit) => unit.start === lines?.start && unit.end === lines?.end) ??
    functions.find((unit) => unit.start === lines?.start)
  )?.name;
}

function branchFunctionNames(units, branchMap = {}) {
  return Object.fromEntries(
    Object.entries(branchMap).map(([branchId, branch]) => [
      branchId,
      narrowest(units, branch.loc?.start?.line),
    ]),
  );
}

/**
 * The functions of one source file: the qualified name of the function a CRAP entry measures
 * (found by its first and last line), of the unit (function, class field initializer or static
 * block) that holds each branch, and of the one that holds a mutant's line.
 */
export function functionIdentity(source, file) {
  const units = unitsOf(source, file);
  return {
    crapFunctionName: (entry) => crapFunctionName(units, entry),
    branchFunctionNames: (branchMap) => branchFunctionNames(units, branchMap),
    functionNameAtLine: (line) => narrowest(units, line),
  };
}
