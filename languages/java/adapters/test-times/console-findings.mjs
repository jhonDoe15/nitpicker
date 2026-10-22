import { globToRegExp } from '../../../../shared/glob.mjs';
import { exceptionHint, exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { readConsoleEntries } from './console-output.mjs';

const CONSOLE_TOOL = 'test-runtime';
const CONSOLE_RULE = 'test-console-output';
export const CONSOLE_EXCEPTION_RULE = `${CONSOLE_TOOL}/${CONSOLE_RULE}`;
const ESCAPE = String.fromCodePoint(0x1b);
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'gu');
const ABSOLUTE_PATH = /(?<![\w/:.\\-])(?:file:\/\/)?(?:[A-Za-z]:)?(?:[\\/][\w.@+~$%-]+)+/gu;
const TIMESTAMP =
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/gu;
const CLOCK_TIME = /\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/gu;
const HEX = /\b0x[0-9a-fA-F]+\b/gu;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const IDENTIFIER = /(?<![A-Za-z0-9])(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{6,}(?![A-Za-z0-9])/gu;
const NUMBER =
  /(?<![A-Za-z_$])\d+(?:[.,]\d+)*(?:%|\s?(?:ms|s|sec|secs|seconds?|min|minutes?|hours?|[kmg]i?b|bytes?)\b)?/giu;
const LOG_THREAD = /(?<=--- )\[[^\]\n]*\]|\[[^\]\n]*\](?= +(?:TRACE|DEBUG|INFO|WARN|ERROR)\b)/gu;
const MAX_MESSAGE_LENGTH = 300;
const MIN_TOKENS = 3;
const MESSAGE =
  'Tests print new console output: {output}. Fix the cause (for example a warning the code under test now logs, or a mock or thread that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. {exception}';

function lastSegment(match) {
  return match.split(/[\\/]/u).at(-1);
}

export function normalizeConsoleMessage(line) {
  return line
    .replaceAll(ANSI, '')
    .replaceAll(LOG_THREAD, '[<thread>]')
    .replaceAll(ABSOLUTE_PATH, lastSegment)
    .replaceAll(TIMESTAMP, '<time>')
    .replaceAll(CLOCK_TIME, '<time>')
    .replaceAll(HEX, '<hex>')
    .replaceAll(UUID, '<uuid>')
    .replaceAll(IDENTIFIER, '<id>')
    .replaceAll(NUMBER, '<n>')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

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

function isLifted(exceptions) {
  const matches = exceptionMatcher(exceptions);
  return (file) => matches(CONSOLE_RULE, file) || matches(`${CONSOLE_TOOL}/${CONSOLE_RULE}`, file);
}

function moduleMessages(entries, { allow, exceptions, modulePath }) {
  const isAllowed = allowMatcher(allow);
  const lifted = isLifted(exceptions);
  const found = entries
    .map((entry) => ({ ...entry, file: inModule(modulePath, entry.file) }))
    .filter(({ file }) => !lifted(file))
    .flatMap(({ file, test, messages }) =>
      messages
        .map(normalizeConsoleMessage)
        .filter((message) => message !== '' && !isAllowed(file, message))
        .map((message) => ({ file, test, message })),
    );
  const messages = new Map();
  for (const printed of found) {
    messages.set(printed.message, messages.get(printed.message) ?? printed);
  }
  return [...messages.values()];
}

function findingFor({ file, test, message }, moduleRoot) {
  const where = test === '' ? file : `${file}, test "${test}"`;
  const tokens = message.split(' ');
  return {
    tool: CONSOLE_TOOL,
    rule: CONSOLE_RULE,
    path: moduleRoot,
    identity: `console:${hash(message)}`,
    message: MESSAGE.replace('{output}', `"${message}" (${where})`).replace(
      '{exception}',
      exceptionHint(CONSOLE_EXCEPTION_RULE, file),
    ),
    classification: 'enforceable',
    ...(tokens.length < MIN_TOKENS ? {} : { tokens }),
  };
}

export function testConsoleFindings(entries, options) {
  const { allow = [], exceptions = [], modulePath = '', moduleRoot = '' } = options;
  return moduleMessages(entries, { allow, exceptions, modulePath })
    .toSorted((left, right) => left.message.localeCompare(right.message))
    .map((found) => findingFor(found, moduleRoot === '' ? '.' : moduleRoot));
}

export function readTestConsoleFindings(location, options) {
  return testConsoleFindings(readConsoleEntries(location), options);
}
