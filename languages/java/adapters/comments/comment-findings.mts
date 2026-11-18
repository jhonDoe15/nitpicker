import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hash, nextOccurrence, projectFilesUnder } from '../typed/finding-views.mts';
import { lineOf } from '../suppressions/java-suppressions.mts';
import { commentLines, commentedOutCode } from './commented-out-code.mts';
import { TASK_MARKER_MESSAGE, unreferencedMarker } from './task-markers.mts';
import type { InlineFinding } from '../suppressions/suppression-types.mts';

type Marker = {
  readonly rule: string;
  readonly message: string;
  readonly offset: number;
  readonly subject: string;
};

export const COMMENTED_OUT_CODE_RULE = 'CommentedOutCode';
export const TASK_MARKER_RULE = 'TodoWithoutIssue';
export const COMMENTED_OUT_CODE_MESSAGE =
  'Delete the commented-out code; version control keeps it.';

function markers(source: string): Marker[] {
  return commentLines(source)
    .filter(({ text }) => unreferencedMarker(text))
    .map(({ offset, text }) => ({
      rule: TASK_MARKER_RULE,
      message: TASK_MARKER_MESSAGE,
      offset,
      subject: text,
    }));
}

function codeFindings(source: string): Marker[] {
  return commentedOutCode(source).map(({ offset, subject }) => ({
    rule: COMMENTED_OUT_CODE_RULE,
    message: COMMENTED_OUT_CODE_MESSAGE,
    offset,
    subject,
  }));
}

export function commentFindings(source: string, filePath: string): InlineFinding[] {
  const occurrences = new Map<string, number>();
  return [...markers(source), ...codeFindings(source)]
    .sort((left, right) => left.offset - right.offset)
    .map(({ rule, message, offset, subject }) => {
      const occurrence = nextOccurrence(occurrences, `${rule}\0${subject}`);
      return {
        tool: 'pmd',
        rule,
        path: filePath,
        identity: `${rule}:${hash(subject)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
        message,
        classification: 'enforceable',
        location: { line: lineOf(source, offset) },
      };
    });
}

export function readCommentFindings(
  projectRoot: string,
  sourceRoots: readonly string[],
): InlineFinding[] {
  return sourceRoots.flatMap((sourceRoot) =>
    projectFilesUnder(path.join(projectRoot, sourceRoot))
      .filter((file) => file.endsWith('.java'))
      .sort()
      .flatMap((file) =>
        commentFindings(
          readFileSync(file, 'utf8'),
          path.relative(projectRoot, file).split(path.sep).join('/'),
        ),
      ),
  );
}
