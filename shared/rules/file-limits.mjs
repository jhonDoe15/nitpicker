// File limits: lines per file, characters per line and code files per folder, from neutral inputs.
//
// Input, produced by a language adapter from its own layout: `CodeFile[]`
//   CodeFile = { path: string, kind: 'source' | 'test', text: string }   // project-relative path
// `path` lists only the code files of the language (never config or assets), so a folder is counted
// only for the code it holds. Source and test files are counted separately per folder.
//
// File and folder findings carry a ratchet: a file or folder already over its limit on the base
// fails only when it grows. A long line is identified by its text, so only lines a change writes fail.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../glob.mjs';
import {
  FILE_LIMIT_DEFAULTS,
  GREW_MESSAGES,
  HELD_MESSAGES,
  MESSAGES,
  RULE_IDS,
  renderMessage,
} from '../policy.mjs';
import { hash, nextOccurrence } from './finding-helpers.mjs';

export const FILE_LIMIT_CHECKS = ['fileLines', 'lineLength', 'folderFiles'];

const UNBREAKABLE_LINE_PATTERNS = [
  /^(?:import|package|from|using)\b/u,
  /\bfrom\s+['"][^'"]+['"];?$/u,
  /\b[a-z][\w+.-]*:\/\/\S/iu,
];
const STRING_LITERAL = /(['"`])(?:\\.|(?!\1).)*\1/gu;

/** Reads each `{ path, kind }` entry under `projectRoot` and evaluates the file limits. */
export function collectFileLimitFindings(projectRoot, entries, options) {
  const files = entries.map((entry) => ({
    ...entry,
    text: readFileSync(path.join(projectRoot, entry.path), 'utf8'),
  }));
  return evaluateFileLimits(files, options);
}

/**
 * `options`: `analyzerName`, `thresholds` (the config's, over `FILE_LIMIT_DEFAULTS`), `exceptions`
 * (`{ rule, paths }` entries; an excepted file is neither checked nor counted in its folder) and
 * `checks`, the subset of `FILE_LIMIT_CHECKS` this language leaves to nitpicker.
 */
export function evaluateFileLimits(files, options) {
  const context = {
    analyzerName: options.analyzerName,
    limits: { ...FILE_LIMIT_DEFAULTS, ...options.thresholds },
    isExcepted: exceptionMatcher(options.exceptions ?? []),
  };
  const checks = options.checks ?? FILE_LIMIT_CHECKS;
  return [
    ...(checks.includes('fileLines')
      ? files.flatMap((file) => fileLineFindings(file, context))
      : []),
    ...(checks.includes('lineLength') ? files.flatMap((file) => lineFindings(file, context)) : []),
    ...(checks.includes('folderFiles') ? folderFindings(files, context) : []),
  ];
}

function exceptionMatcher(exceptions) {
  const matchers = exceptions.map(({ rule, paths }) => ({
    rule,
    patterns: paths.map((glob) => globToRegExp(glob)),
  }));
  return (rule, filePath) =>
    matchers.some(
      (matcher) =>
        matcher.rule === rule && matcher.patterns.some((pattern) => pattern.test(filePath)),
    );
}

function lineCount(text) {
  const lines = text.split(/\r?\n/u);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function fileLineFindings(file, context) {
  const limit = file.kind === 'test' ? context.limits.testFileLines : context.limits.fileLines;
  const value = lineCount(file.text);
  if (value <= limit || context.isExcepted(RULE_IDS.fileLines, file.path)) {
    return [];
  }
  const values = { path: file.path, value, limit, base: '{base}' };
  return [
    ratchetedFinding(context, {
      rule: RULE_IDS.fileLines,
      path: file.path,
      key: 'file-lines',
      value,
      messages: messagesFor('fileLines', values),
    }),
  ];
}

function lineFindings(file, context) {
  const limit = context.limits.lineLength;
  if (context.isExcepted(RULE_IDS.lineLength, file.path)) {
    return [];
  }
  const occurrences = new Map();
  return file.text.split(/\r?\n/u).flatMap((text, index) => {
    const value = [...text].length;
    if (value <= limit || isUnbreakable(text.trim(), limit)) {
      return [];
    }
    const digest = hash(text.trim());
    return [
      {
        tool: context.analyzerName,
        rule: RULE_IDS.lineLength,
        path: file.path,
        identity: `line:${digest}:occurrence:${String(nextOccurrence(occurrences, digest))}`,
        message: renderMessage(MESSAGES.lineLength, { value, limit }),
        classification: 'enforceable',
        location: { line: index + 1 },
      },
    ];
  });
}

function isUnbreakable(trimmedLine, limit) {
  return (
    UNBREAKABLE_LINE_PATTERNS.some((pattern) => pattern.test(trimmedLine)) ||
    [...trimmedLine.replaceAll(STRING_LITERAL, "''")].length <= limit
  );
}

function folderFindings(files, context) {
  const counts = new Map();
  for (const file of files) {
    if (!context.isExcepted(RULE_IDS.folderFiles, file.path)) {
      const key = `${path.posix.dirname(file.path)}\0${file.kind}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const limit = context.limits.folderFiles;
  return [...counts]
    .filter(([, value]) => value > limit)
    .map(([key, value]) => folderFinding(context, { key, value, limit }));
}

function folderFinding(context, { key, value, limit }) {
  const [folder, kind] = key.split('\0');
  const values = { path: folder, value, kind, limit, base: '{base}' };
  return ratchetedFinding(context, {
    rule: RULE_IDS.folderFiles,
    path: folder,
    key: `folder-files:${kind}`,
    value,
    messages: messagesFor('folderFiles', values),
  });
}

function messagesFor(name, values) {
  return {
    message: renderMessage(MESSAGES[name], values),
    worseMessage: renderMessage(GREW_MESSAGES[name], values),
    heldMessage: renderMessage(HELD_MESSAGES[name], values),
  };
}

function ratchetedFinding(context, { rule, path: findingPath, key, value, messages }) {
  return {
    tool: context.analyzerName,
    rule,
    path: findingPath,
    identity: `${key}:${String(value)}`,
    message: messages.message,
    classification: 'enforceable',
    ratchet: {
      key,
      value,
      worseMessage: messages.worseMessage,
      heldMessage: messages.heldMessage,
    },
  };
}
