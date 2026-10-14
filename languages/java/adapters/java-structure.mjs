import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import { readStructureFindings, STRUCTURE_TOOL } from '../../../shared/ingest/structure-report.mjs';
import { collectFileLimitFindings } from '../../../shared/rules/file-limits.mjs';

export function readJavaStructureFindings(reportRoot, projectRoot) {
  return readStructureFindings(reportRoot, projectRoot);
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
  const excluders = (policy.exclude ?? []).map((glob) => globToRegExp(glob));
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
