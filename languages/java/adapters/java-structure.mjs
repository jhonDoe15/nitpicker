import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from '../../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../../shared/rules/structure.mjs';

const STRUCTURE_REPORT = 'structure.json';
const STRUCTURE_TOOL = 'structure';

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
