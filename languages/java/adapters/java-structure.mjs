import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import { collectFileLimitFindings } from '../../../shared/rules/file-limits.mjs';
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

export function methodText(sources, projectRoot, { file, start, end }) {
  if (!sources.has(file)) {
    sources.set(file, readFileSync(path.join(projectRoot, file), 'utf8').split(/\r?\n/));
  }
  return sources
    .get(file)
    .slice(start - 1, end)
    .map((line) => line.trim())
    .join('\n');
}

export function readJavaFileLimitFindings(
  projectRoot,
  { manifest, fileLimits = {}, exclude = [] },
) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const entries = [
    ...javaFiles(projectRoot, manifest.sourceRoots ?? [], 'source'),
    ...javaFiles(projectRoot, manifest.testSourceRoots ?? [], 'test'),
  ].filter((entry) => !excluders.some((matcher) => matcher.test(entry.path)));
  return collectFileLimitFindings(projectRoot, entries, {
    analyzerName: STRUCTURE_TOOL,
    thresholds: fileLimits.thresholds,
    exceptions: fileLimits.exceptions,
    checks: ['fileLines', 'folderFiles'],
  });
}

function javaFiles(projectRoot, roots, kind) {
  return roots
    .filter((root) => existsSync(path.join(projectRoot, root)))
    .flatMap((root) =>
      readdirSync(path.join(projectRoot, root), { recursive: true })
        .filter((file) => file.endsWith('.java'))
        .map((file) => ({ path: path.posix.join(root, file.split(path.sep).join('/')), kind })),
    );
}
