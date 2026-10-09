import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from '../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../shared/rules/structure.mjs';

// Java adapter of the shared structure rule: build/nitpicker/structure.json (written by
// java/StructureMetrics.java: per method and constructor lines, statements, maxControlNesting,
// parameters, file, name, start, end) becomes the neutral `StructureReport` the shared rule
// evaluates, so Java gets the same rule ids and messages as TypeScript. Only the enforceable
// limit findings are kept: the per-method descriptive metrics would add four findings for every
// method of the project to every report.

export const STRUCTURE_REPORT = 'structure.json';
export const STRUCTURE_TOOL = 'structure';

export function readJavaStructureFindings(reportRoot, projectRoot) {
  const report = path.join(reportRoot, STRUCTURE_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const sources = new Map();
  const functions = JSON.parse(readFileSync(report, 'utf8')).map((entry) => ({
    ...entry,
    sourceHash: hash(methodText(sources, projectRoot, entry)),
  }));
  return evaluateStructure({ functions }, STRUCTURE_TOOL).filter(
    (finding) => finding.classification === 'enforceable',
  );
}

// The method's lines with indentation removed, so moving or re-indenting a method keeps its
// identity while editing it does not.
function methodText(sources, projectRoot, { file, start, end }) {
  if (!sources.has(file)) {
    sources.set(file, readFileSync(path.join(projectRoot, file), 'utf8').split(/\r?\n/));
  }
  return sources
    .get(file)
    .slice(start - 1, end)
    .map((line) => line.trim())
    .join('\n');
}
