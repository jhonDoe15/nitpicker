import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from '../../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../../shared/rules/structure.mjs';

const STRUCTURE_REPORT = 'structure.json';
const STRUCTURE_TOOL = 'structure';

export function readJavaStructureFindings(reportRoot, projectRoot) {
  return readStructureFindings(reportRoot, projectRoot);
}

export function readStructureFunctions(reportRoot) {
  const report = path.join(reportRoot, STRUCTURE_REPORT);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : [];
}

export function readStructureFindings(reportRoot, projectRoot, options) {
  const entries = readStructureFunctions(reportRoot);
  return entries.length === 0 ? [] : structureFindings(entries, projectRoot, options);
}

export function structureFindings(
  entries,
  projectRoot,
  { textOf = methodText, hints, exceptionKey } = {},
) {
  const sources = new Map();
  const functions = entries.map((entry) => ({
    ...entry,
    sourceHash: hash(textOf(sources, projectRoot, entry)),
  }));
  return evaluateStructure({ functions }, STRUCTURE_TOOL, { hints, exceptionKey }).filter(
    (finding) => finding.classification === 'enforceable',
  );
}

export function sourceLines(sources, projectRoot, file) {
  if (!sources.has(file)) {
    sources.set(file, readFileSync(path.join(projectRoot, file), 'utf8').split(/\r?\n/));
  }
  return sources.get(file);
}

export function methodText(sources, projectRoot, { file, start, end }) {
  return sourceLines(sources, projectRoot, file)
    .slice(start - 1, end)
    .map((line) => line.trim())
    .join('\n');
}
