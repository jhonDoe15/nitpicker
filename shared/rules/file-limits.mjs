// File limits: lines per file, characters per line and code files per folder, from neutral inputs.
//
// Input, produced by a language adapter from its own layout: `CodeFile[]`
//   CodeFile = { path: string, kind: 'source' | 'test', text: string }   // project-relative path
// `path` lists only the code files of the language (never config or assets), so a folder is counted
// only for the code it holds. Source and test files are counted separately per folder, and test files
// under a `fixtures` (or `__fixtures__`) folder are test data, not checked.
//
// Every finding carries a ratchet, so code already over a limit on the base fails only when it gets
// worse: a file that grows, a folder that gains a file, or a long line an edit makes longer. A long
// line is identified by its text; an edited one is held against a long line the edit removed from
// the same file, and a long line with nothing to be held against fails.

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

const TEST_DATA_FOLDER = /(?:^|\/)(?:__)?fixtures(?:__)?\//u;
const IMPORT_LINES = [
  /^import\s[^;]*;?$/u,
  /^export\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+[\w$]+)?\s+from\s+['"][^'"]*['"];?$/u,
  /^\}\s*from\s+['"]/u,
  /^package\s+[\w.]+;?$/u,
  /^from\s+\S+\s+import\s/u,
  /^using\s+[\w.]+;?$/u,
];
const URL = /\b[a-z][\w+.-]*:\/\/\S+/giu;
const TEMPLATE_LITERAL = /`(?:\\.|[^`\\])*`/gu;
const INTERPOLATION = /\$\{[^}]*\}/gu;
const QUOTED_STRING = /(['"])(?:\\.|(?!\1)[^\\])*\1/gu;

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
 * (`{ rule, paths }` entries; an excepted file is neither checked nor counted in its folder, and a
 * folder-files exception may also name the folder itself) and `checks`, the subset of
 * `FILE_LIMIT_CHECKS` this language leaves to nitpicker.
 */
export function evaluateFileLimits(files, options) {
  const context = {
    analyzerName: options.analyzerName,
    limits: { ...FILE_LIMIT_DEFAULTS, ...options.thresholds },
    isExcepted: exceptionMatcher(options.exceptions ?? []),
  };
  const checked = [...new Map(files.map((file) => [file.path, file])).values()].filter(
    (file) => file.kind !== 'test' || !TEST_DATA_FOLDER.test(file.path),
  );
  const checks = options.checks ?? FILE_LIMIT_CHECKS;
  return [
    ...(checks.includes('fileLines')
      ? checked.flatMap((file) => fileLineFindings(file, context))
      : []),
    ...(checks.includes('lineLength')
      ? checked.flatMap((file) => lineFindings(file, context))
      : []),
    ...(checks.includes('folderFiles') ? folderFindings(checked, context) : []),
  ];
}

function exceptionMatcher(exceptions) {
  const matchers = exceptions.map(({ rule, paths }) => ({
    rule,
    patterns: paths.map((glob) => globToRegExp(glob)),
  }));
  return (rule, ...candidates) =>
    matchers.some(
      (matcher) =>
        matcher.rule === rule &&
        matcher.patterns.some((pattern) => candidates.some((candidate) => pattern.test(candidate))),
    );
}

function exceptionText(rule, glob) {
  return JSON.stringify({ rule, paths: [glob], reason: '...' });
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
  const exception = exceptionText(RULE_IDS.fileLines, file.path);
  return [
    ratchetedFinding(context, {
      rule: RULE_IDS.fileLines,
      path: file.path,
      identity: `file-lines:${String(value)}`,
      key: 'file-lines',
      value,
      messages: messagesFor('fileLines', { value, limit, exception, base: '{base}' }),
    }),
  ];
}

function lineFindings(file, context) {
  const limit = context.limits.lineLength;
  if (context.isExcepted(RULE_IDS.lineLength, file.path)) {
    return [];
  }
  const exception = exceptionText(RULE_IDS.lineLength, file.path);
  const occurrences = new Map();
  return file.text.split(/\r?\n/u).flatMap((text, index) => {
    const value = [...text].length;
    if (value <= limit || isUnbreakable(text, limit)) {
      return [];
    }
    const digest = hash(text.trim());
    const occurrence = String(nextOccurrence(occurrences, digest));
    const finding = ratchetedFinding(context, {
      rule: RULE_IDS.lineLength,
      path: file.path,
      identity: `line:${digest}:occurrence:${occurrence}`,
      key: 'long-line',
      value,
      messages: messagesFor('lineLength', { value, limit, exception, base: '{base}' }),
    });
    return [{ ...finding, location: { line: index + 1 } }];
  });
}

function isUnbreakable(text, limit) {
  return IMPORT_LINES.some((pattern) => pattern.test(text.trim())) || countedLength(text) <= limit;
}

function countedLength(text) {
  const withoutTemplateText = text.replaceAll(
    TEMPLATE_LITERAL,
    (template) => `\`${(template.match(INTERPOLATION) ?? []).join('')}\``,
  );
  return [...withoutTemplateText.replaceAll(QUOTED_STRING, "''").replaceAll(URL, '')].length;
}

function folderFindings(files, context) {
  const counts = new Map();
  for (const file of files) {
    const folder = path.posix.dirname(file.path);
    if (!context.isExcepted(RULE_IDS.folderFiles, file.path, folder)) {
      const key = `${folder}\0${file.kind}`;
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
  const glob = folder === '.' ? '*' : `${folder}/*`;
  const exception = exceptionText(RULE_IDS.folderFiles, glob);
  return ratchetedFinding(context, {
    rule: RULE_IDS.folderFiles,
    path: folder,
    identity: `folder-files:${kind}:${String(value)}`,
    key: `folder-files:${kind}`,
    value,
    messages: messagesFor('folderFiles', { value, kind, limit, exception, base: '{base}' }),
  });
}

function messagesFor(name, values) {
  return {
    message: renderMessage(MESSAGES[name], values),
    worseMessage: renderMessage(GREW_MESSAGES[name], values),
    heldMessage: renderMessage(HELD_MESSAGES[name], values),
  };
}

function ratchetedFinding(context, { rule, path: findingPath, identity, key, value, messages }) {
  return {
    tool: context.analyzerName,
    rule,
    path: findingPath,
    identity,
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
