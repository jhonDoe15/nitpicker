import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../../shared/glob.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { hash, repeatsInSource } from '../../../../shared/rules/finding-helpers.mjs';
import { evaluateStructure } from '../../../../shared/rules/structure.mjs';
import { javaFolderDepthFindings } from '../size/folder-depth.mjs';
import { javaLineLengthFindings } from '../size/line-length.mjs';
import { javaLineLength } from '../style/java-style.mjs';

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

export function structureFindings(
  entries,
  projectRoot,
  { textOf = methodText, hints, numberedAmongSameSource } = {},
) {
  const sources = new Map();
  const functions = entries.map((entry) => ({
    ...entry,
    numberedAmongSameSource: repeatsInSource(entry.name),
    sourceHash: hash(textOf(sources, projectRoot, entry)),
    numberedAmongSameSource: numberedAmongSameSource ?? entry.numberedAmongSameSource,
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

function projectCodeFiles(projectRoot, { manifest, kotlin, exclude = [] }) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
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
