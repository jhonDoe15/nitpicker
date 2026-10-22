import path from 'node:path';
import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/project-rules/size-rules.mjs';
import { structureFindings } from '../../../../shared/ingest/structure-report.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { classLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { folderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';

const STRUCTURE_TOOL = 'structure';
const ACCESS_FOLDERS = new Set(['internal']);
const PACKAGE_MARKER = 'doc.go';
const TYPE_MESSAGES = { classMethods: 'typeMethods', classFields: 'structFields' };
const STRUCTURE_HINTS = {
  maxControlNesting:
    'An else-if chain counts as one level; return early, use a switch, or move what nests inside a branch into a helper function.',
  parameters:
    'Group related parameters into a struct, or pass an options struct; the receiver does not count.',
};
const DEPTH_WORDING = {
  subject: 'Package',
  below: 'the module root',
  advice: (limit) =>
    `Keep packages at most ${String(limit)} levels below the module root (internal does not count): group by responsibility instead of nesting.`,
};

function sourceFiles(report) {
  return report.files.filter(({ generated }) => !generated);
}

function packageParts(file) {
  return path.posix
    .dirname(file)
    .split('/')
    .filter((part) => part !== '.' && !ACCESS_FOLDERS.has(part));
}

export function goStructureFindings(report, projectRoot, policy = {}) {
  const limits = { thresholds: policy.fileLimits ?? {}, exceptions: policy.exceptions ?? [] };
  const files = sourceFiles(report).map((file) => ({
    path: file.path,
    kind: file.test ? 'test' : 'source',
    countsInFolder: path.posix.basename(file.path) !== PACKAGE_MARKER,
  }));
  return [
    ...structureFindings(report.functions, projectRoot, { hints: STRUCTURE_HINTS }),
    ...classLimitFindings(
      report.types.filter(({ kind }) => kind !== 'interface'),
      { analyzerName: STRUCTURE_TOOL, messageKeys: TYPE_MESSAGES, ...limits },
    ),
    ...collectFileLimitFindings(projectRoot, files, {
      analyzerName: STRUCTURE_TOOL,
      thresholds: limits.thresholds,
      exceptions: limits.exceptions,
    }),
    ...folderDepthFindings(
      files.map((file) => ({ ...file, parts: packageParts(file.path) })),
      {
        analyzerName: STRUCTURE_TOOL,
        limit: limits.thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.go,
        exceptions: limits.exceptions,
        wording: DEPTH_WORDING,
        depthOf: ({ parts }) => parts.length,
      },
    ),
  ];
}
