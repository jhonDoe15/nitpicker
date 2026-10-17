import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { snapshotScope } from './test-results.mjs';

const TOOL_SKIPPED_RULE = 'tool-skipped';
const CHECKSTYLE_TOOL = 'checkstyle';
export const ERROR_PRONE_SKIPPED = 'errorprone-skipped.txt';
export const FORMAT_SKIPPED = 'format-skipped.txt';
export const STRUCTURE_SKIPPED = 'structure-skipped.txt';
export const CHECKSTYLE_SKIPPED = 'checkstyle-skipped.txt';
const KOTLIN_METRICS_SKIPPED = 'kotlin-metrics-skipped.txt';
const SKIP_REPORTS = [
  [ERROR_PRONE_SKIPPED, 'errorprone', 'Error Prone'],
  [FORMAT_SKIPPED, 'google-java-format', 'google-java-format'],
  [CHECKSTYLE_SKIPPED, CHECKSTYLE_TOOL, 'Checkstyle'],
  [STRUCTURE_SKIPPED, 'structure', 'The structure metrics'],
  [STRUCTURE_SKIPPED, 'crap', 'CRAP'],
  ['detekt-skipped.txt', 'detekt', 'detekt'],
  ['ktlint-skipped.txt', 'ktlint', 'ktlint'],
  ['ktfmt-skipped.txt', 'ktfmt', 'ktfmt'],
  [KOTLIN_METRICS_SKIPPED, 'structure', 'The Kotlin structure metrics'],
  [KOTLIN_METRICS_SKIPPED, 'crap', 'Kotlin CRAP'],
];

const PARSE_SKIP_SOURCE = /(?:^|\.)TreeWalker$/u;

function toolSkipped(tool, message) {
  return {
    tool,
    rule: TOOL_SKIPPED_RULE,
    path: '.',
    identity: TOOL_SKIPPED_RULE,
    classification: 'tool-error',
    message,
  };
}

export function withoutCheckstyleParseSkips(findings, testScope = {}) {
  const skipped = findings.filter(
    (finding) => finding.tool === CHECKSTYLE_TOOL && PARSE_SKIP_SOURCE.test(finding.rule),
  );
  if (skipped.length === 0) {
    return findings;
  }
  const files = [...new Set(skipped.map((finding) => finding.path))].sort();
  return [
    ...findings.filter((finding) => !skipped.includes(finding)),
    toolSkipped(
      CHECKSTYLE_TOOL,
      `Checkstyle did not run in ${snapshotScope(testScope)}: it cannot parse ${files.join(', ')}, ` +
        'whose Java syntax is newer than the pinned Checkstyle knows. The other analyzers still ran.',
    ),
  ];
}

function skipReason(reportRoot, file) {
  const base = path.resolve(reportRoot);
  const full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? readFileSync(full, 'utf8').trim() : undefined;
}

export function skippedToolFindings({ reportRoot, testScope = {} }) {
  return SKIP_REPORTS.flatMap(([file, tool, name]) => {
    const reason = skipReason(reportRoot, file);
    return reason === undefined
      ? []
      : [toolSkipped(tool, `${name} did not run in ${snapshotScope(testScope)}: ${reason}.`)];
  });
}
