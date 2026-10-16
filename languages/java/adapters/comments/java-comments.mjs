import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash, nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import {
  bodyLines,
  firstCommentedOutCodeLine,
  unreferencedWorkTagLines,
} from '../../../../shared/comments/comment-checks.mjs';

const COMMENTS_TOOL = 'comments';
const TODO_RULE = 'TodoWithoutIssue';
const CODE_RULE = 'CommentedOutCode';
const TOKENS =
  /"""(?:[^\\]|\\[\s\S])*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

const MESSAGES = {
  [TODO_RULE]:
    'A TODO or FIXME needs an issue reference: write "TODO(#123): ..." or "TODO PROJ-123: ...", or do the work now.',
  [CODE_RULE]: 'Delete the commented-out code; version control keeps it.',
};

export function readCommentFindings(projectRoot, sourceRoots) {
  return sourceRoots.flatMap((sourceRoot) =>
    javaFiles(path.join(projectRoot, sourceRoot)).flatMap((file) =>
      commentFindings(
        readFileSync(file, 'utf8'),
        path.relative(projectRoot, file).split(path.sep).join('/'),
      ),
    ),
  );
}

function javaFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function lineNumbers(source, offsets) {
  let line = 1;
  let position = 0;
  return offsets.map((offset) => {
    line += source.slice(position, offset).split('\n').length - 1;
    position = offset;
    return line;
  });
}

function rawComments(source) {
  return [...source.matchAll(TOKENS)]
    .filter(([token]) => token.startsWith('/'))
    .map(({ 0: token, index }) => ({ token, index, end: index + token.length }));
}

function startsNextLine(source, previous, next) {
  return (
    previous.token.startsWith('//') &&
    next.token.startsWith('//') &&
    /^[ \t]*\n[ \t]*$/.test(source.slice(previous.end, next.index))
  );
}

function groupLineComments(source, comments) {
  const groups = [];
  for (const comment of comments) {
    const last = groups.at(-1);
    if (last !== undefined && startsNextLine(source, last.at(-1), comment)) {
      last.push(comment);
    } else {
      groups.push([comment]);
    }
  }
  return groups;
}

function groupLines(group) {
  if (group[0].token.startsWith('//')) {
    return group.map(({ token }) => token.slice(2).trim());
  }
  return bodyLines(group[0].token.slice(2, -2));
}

function groupReports(lines, isJavadoc) {
  const todo = unreferencedWorkTagLines(lines).map((line) => ({ rule: TODO_RULE, line }));
  const code = isJavadoc ? -1 : firstCommentedOutCodeLine(lines);
  return code === -1 ? todo : [...todo, { rule: CODE_RULE, line: code }];
}

export function commentFindings(source, filePath) {
  const occurrences = new Map();
  const groups = groupLineComments(source, rawComments(source));
  const firstLines = lineNumbers(
    source,
    groups.map((group) => group[0].index),
  );
  return groups.flatMap((group, groupIndex) => {
    const lines = groupLines(group);
    const firstLine = firstLines[groupIndex];
    return groupReports(lines, group[0].token.startsWith('/**')).map(({ rule, line }) => {
      const key = `${rule}\0${lines[line].trim()}`;
      const occurrence = nextOccurrence(occurrences, key);
      return {
        tool: COMMENTS_TOOL,
        rule,
        path: filePath,
        identity: `${rule}:${hash(key)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
        message: MESSAGES[rule],
        classification: 'enforceable',
        location: { line: rule === CODE_RULE ? firstLine : firstLine + line },
      };
    });
  });
}
