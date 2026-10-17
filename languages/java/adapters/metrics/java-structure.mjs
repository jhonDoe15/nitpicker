import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/glob.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../../../shared/rules/structure.mjs';

const STRUCTURE_REPORT = 'structure.json';
const STRUCTURE_TOOL = 'structure';

export function readJavaStructureFindings(reportRoot, projectRoot) {
  return readStructureFindings(reportRoot, projectRoot);
}

export function readStructureFindings(reportRoot, projectRoot, options) {
  const report = path.join(reportRoot, STRUCTURE_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  return structureFindings(JSON.parse(readFileSync(report, 'utf8')), projectRoot, options);
}

export function structureFindings(entries, projectRoot, { textOf = methodText, hints } = {}) {
  const sources = new Map();
  const functions = entries.map((entry) => ({
    ...entry,
    sourceHash: hash(textOf(sources, projectRoot, entry)),
  }));
  return evaluateStructure({ functions }, STRUCTURE_TOOL, { hints }).filter(
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

const SOURCE_ROOT_KEYS = { source: 'sourceRoots', test: 'testSourceRoots' };
const KOTLIN_ROOT_KEYS = { source: 'kotlinSourceRoots', test: 'kotlinTestSourceRoots' };

const OUTSIDE_SOURCES = /^(?:$|\.\.(?:\/|$)|build(?:\/|$))/u;

function rootsOf(manifest, kind, kotlin) {
  return [
    ...(manifest[SOURCE_ROOT_KEYS[kind]] ?? []),
    ...(kotlin ? (manifest[KOTLIN_ROOT_KEYS[kind]] ?? []) : []),
  ].filter((root) => !OUTSIDE_SOURCES.test(root));
}

export function readJavaFileLimitFindings(projectRoot, { manifest, kotlin = false, policy = {} }) {
  const excluders = (policy.exclude ?? []).map((glob) => globMatcher(glob));
  const entries = [
    ...codeFiles(projectRoot, {
      roots: rootsOf(manifest, 'source', kotlin),
      kind: 'source',
      kotlin,
    }),
    ...codeFiles(projectRoot, { roots: rootsOf(manifest, 'test', kotlin), kind: 'test', kotlin }),
  ].filter((entry) => !excluders.some((matcher) => matcher.test(entry.path)));
  return collectFileLimitFindings(projectRoot, entries, {
    analyzerName: STRUCTURE_TOOL,
    thresholds: policy.thresholds,
    exceptions: policy.exceptions,
    checks: ['fileLines', 'folderFiles'],
  });
}

function codeFiles(projectRoot, { roots, kind, kotlin }) {
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  return [...new Set(roots)]
    .filter((root) => existsSync(path.join(projectRoot, root)))
    .flatMap((root) =>
      readdirSync(path.join(projectRoot, root), { recursive: true })
        .filter((file) => extensions.includes(path.extname(file)))
        .map((file) => ({ path: path.posix.join(root, file.split(path.sep).join('/')), kind })),
    );
}
