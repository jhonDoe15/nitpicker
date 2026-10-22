import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';
import {
  readStructureFindings,
  STRUCTURE_TOOL,
} from '../../../../shared/ingest/structure-report.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { javaFolderDepthFindings } from '../size/folder-depth.mjs';
import { javaLineLengthFindings } from '../size/line-length.mjs';
import { javaLineLength } from '../style/java-style.mjs';

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

function projectCodeFiles(projectRoot, { manifest, kotlin, exclude = [] }) {
  const excluders = exclude.map((glob) => globMatcher(glob));
  return [
    ...codeFiles(projectRoot, {
      roots: rootsOf(manifest, 'source', kotlin),
      kind: 'source',
      kotlin,
    }),
    ...codeFiles(projectRoot, { roots: rootsOf(manifest, 'test', kotlin), kind: 'test', kotlin }),
  ].filter((entry) => !excluders.some((matcher) => matcher.test(entry.path)));
}

export function readJavaFileLimitFindings(projectRoot, { manifest, kotlin = false, policy = {} }) {
  const entries = projectCodeFiles(projectRoot, { manifest, kotlin, exclude: policy.exclude });
  const rootEntries =
    policy.baselineRoot === undefined
      ? entries
      : projectCodeFiles(policy.baselineRoot, { manifest, kotlin, exclude: policy.exclude });
  const options = {
    analyzerName: STRUCTURE_TOOL,
    thresholds: policy.thresholds,
    exceptions: policy.exceptions,
  };
  return [
    ...collectFileLimitFindings(projectRoot, entries, {
      ...options,
      checks: ['fileLines', 'folderFiles'],
    }),
    ...javaLineLengthFindings(javaFiles(projectRoot, entries), {
      ...options,
      lineLength: javaLineLength(policy.conventions),
    }),
    ...javaFolderDepthFindings(entries, { ...options, rootEntries }),
  ];
}

function javaFiles(projectRoot, entries) {
  const base = path.resolve(projectRoot);
  return entries
    .filter((entry) => entry.path.endsWith('.java'))
    .flatMap((entry) => {
      const full = path.resolve(base, entry.path);
      if (!full.startsWith(base + path.sep)) {
        return [];
      }
      return [{ ...entry, text: readFileSync(full, 'utf8') }];
    });
}

function codeFiles(projectRoot, { roots, kind, kotlin }) {
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  return [...new Set(roots)]
    .filter((root) => existsSync(path.join(projectRoot, root)))
    .flatMap((root) =>
      readdirSync(path.join(projectRoot, root), { recursive: true })
        .filter((file) => extensions.includes(path.extname(file)))
        .map((file) => ({
          path: path.posix.join(root, file.split(path.sep).join('/')),
          packagePath: path.posix.dirname(file.split(path.sep).join('/')).replace(/^\.$/u, ''),
          kind,
        })),
    );
}
