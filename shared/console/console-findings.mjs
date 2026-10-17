import { globToRegExp } from '../glob.mjs';
import { MESSAGES, RULE_IDS, renderMessage } from '../policy.mjs';
import { exceptionMatcher, exceptionText } from '../rules/exceptions.mjs';
import { hash } from '../rules/finding-helpers.mjs';
import { normalizeConsoleMessage } from './console-messages.mjs';

function allowMatcher(allow) {
  const entries = allow.map(({ contains, paths }) => ({
    needle: normalizeConsoleMessage(contains),
    paths: paths?.map((glob) => globToRegExp(glob)),
  }));
  return (file, message) =>
    entries.some(
      (entry) =>
        message.includes(entry.needle) &&
        (entry.paths === undefined || entry.paths.some((glob) => glob.test(file))),
    );
}

function projectFile(file) {
  return file === '' || file.startsWith('..') ? '.' : file;
}

function entryMessages(entry, { isAllowed, isExcepted }) {
  const file = projectFile(entry.file);
  if (isExcepted(RULE_IDS.testConsoleOutput, file)) {
    return [];
  }
  return entry.messages
    .map((line) => normalizeConsoleMessage(line))
    .filter((message) => message !== '' && !isAllowed(file, message))
    .map((message) => ({ file, message, test: entry.test }));
}

function newMessages(report, { allow, exceptions }) {
  const context = { isAllowed: allowMatcher(allow), isExcepted: exceptionMatcher(exceptions) };
  const messages = new Map();
  for (const found of report.entries.flatMap((entry) => entryMessages(entry, context))) {
    const key = `${found.file}\0${found.message}`;
    messages.set(key, messages.get(key) ?? found);
  }
  return [...messages.values()];
}

const MIN_TOKENS = 3;

function tokensOf(message) {
  const tokens = message.split(' ');
  return tokens.length < MIN_TOKENS ? {} : { tokens };
}

function findingFor({ file, message, test }, analyzerName) {
  const where = test === '' ? '' : ` (test "${test}")`;
  return {
    tool: analyzerName,
    rule: RULE_IDS.testConsoleOutput,
    path: file,
    identity: `console:${hash(message)}`,
    message: renderMessage(MESSAGES.testConsoleOutput, {
      output: `"${message}"${where}`,
      exception: exceptionText(RULE_IDS.testConsoleOutput, file),
    }),
    classification: 'enforceable',
    ...tokensOf(message),
  };
}

export function testConsoleFindings(report, { analyzerName, allow = [], exceptions = [] }) {
  return newMessages(report, { allow, exceptions })
    .toSorted(
      (left, right) =>
        left.file.localeCompare(right.file) || left.message.localeCompare(right.message),
    )
    .map((message) => findingFor(message, analyzerName));
}
