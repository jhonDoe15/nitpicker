import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import { hash, nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import { lineOf } from '../suppressions/java-suppressions.mjs';
import { commentLines, commentedOutCode } from './commented-out-code.mjs';
import { TASK_MARKER_MESSAGE, unreferencedMarker } from './task-markers.mjs';

export const COMMENTED_OUT_CODE_RULE = 'CommentedOutCode';
export const TASK_MARKER_RULE = 'TodoWithoutIssue';
export const COMMENTED_OUT_CODE_MESSAGE =
  'Delete the commented-out code; version control keeps it.';

function markers(source) {
  return commentLines(source)
    .filter(({ text }) => unreferencedMarker(text))
    .map(({ offset, text }) => ({
      rule: TASK_MARKER_RULE,
      message: TASK_MARKER_MESSAGE,
      offset,
      subject: text,
    }));
}

function codeFindings(source) {
  return commentedOutCode(source).map(({ offset, subject }) => ({
    rule: COMMENTED_OUT_CODE_RULE,
    message: COMMENTED_OUT_CODE_MESSAGE,
    offset,
    subject,
  }));
}

export function commentFindings(source, filePath) {
  const occurrences = new Map();
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

export function readCommentFindings(projectRoot, sourceRoots) {
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
