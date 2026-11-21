import { globMatcher } from '../../paths/glob.mts';
import { MESSAGES, RULE_IDS } from '../../policy.mts';
import { fieldOf, listOf } from '../../values/readers.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactConsoleEntry } from '../facts/typed/fact-types.mts';
import { messageParts } from '../facts/typed/message-parts.mts';
import { exceptionMatcher, exceptionText } from '../exceptions.mts';
import { hash } from '../finding-parts.mts';
import { normalizeConsoleMessage } from './console-messages.mts';

type AllowEntry = { readonly contains: string; readonly paths?: readonly string[] | undefined };

type PrintedMessage = { readonly file: string; readonly message: string; readonly test: string };

type MessageContext = {
  readonly isAllowed: (file: string, message: string) => boolean;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
};

type ExceptionRule = NonNullable<Parameters<typeof exceptionMatcher>[0]>[number];

function isAllowEntry(value: unknown): value is AllowEntry {
  return typeof fieldOf(value, 'contains') === 'string';
}

function isConsoleEntry(value: unknown): value is FactConsoleEntry {
  const messages = fieldOf(value, 'messages');
  return (
    typeof fieldOf(value, 'file') === 'string' &&
    typeof fieldOf(value, 'test') === 'string' &&
    Array.isArray(messages) &&
    messages.every((message) => typeof message === 'string')
  );
}

function isExceptionRule(value: unknown): value is ExceptionRule {
  return typeof fieldOf(value, 'rule') === 'string';
}

export function consoleAllowMatcher(
  allow: readonly AllowEntry[],
): (file: string, message: string) => boolean {
  const entries = allow.map(({ contains, paths }) => ({
    needle: normalizeConsoleMessage(contains),
    paths: paths?.map((glob) => globMatcher(glob)),
  }));
  return (file, message) =>
    entries.some(
      (entry) =>
        message.includes(entry.needle) &&
        (entry.paths === undefined || entry.paths.some((glob) => glob.test(file))),
    );
}

function projectFile(file: string): string {
  return file === '' || file.startsWith('..') ? '.' : file;
}

function entryMessages(
  entry: FactConsoleEntry,
  { isAllowed, isExcepted }: MessageContext,
): PrintedMessage[] {
  const file = projectFile(entry.file);
  if (isExcepted(RULE_IDS.testConsoleOutput, file)) {
    return [];
  }
  return entry.messages
    .map((line) => normalizeConsoleMessage(line))
    .filter((message) => message !== '' && !isAllowed(file, message))
    .map((message) => ({ file, message, test: entry.test }));
}

function newMessages(
  report: { readonly entries: readonly FactConsoleEntry[] },
  {
    allow,
    exceptions,
  }: { readonly allow: readonly AllowEntry[]; readonly exceptions: readonly ExceptionRule[] },
): PrintedMessage[] {
  const context: MessageContext = {
    isAllowed: consoleAllowMatcher(allow),
    isExcepted: exceptionMatcher(exceptions),
  };
  const messages = new Map<string, PrintedMessage>();
  for (const found of report.entries.flatMap((entry) => entryMessages(entry, context))) {
    const key = JSON.stringify([found.file, found.message]);
    messages.set(key, messages.get(key) ?? found);
  }
  return [...messages.values()];
}

const MIN_TOKENS = 3;

export function consoleTokens(message: string): { readonly tokens?: string[] } {
  const tokens = message.split(' ').filter((token) => token !== '');
  return tokens.length < MIN_TOKENS ? {} : { tokens };
}

function findingFor({ file, message, test }: PrintedMessage, analyzerName: string): Finding {
  const where = test === '' ? '' : ` (test "${test}")`;
  return {
    tool: analyzerName,
    rule: RULE_IDS.testConsoleOutput,
    path: file,
    identity: `console:${hash(message)}`,
    ...messageParts(MESSAGES.testConsoleOutput, {
      output: `"${message}"${where}`,
      exception: exceptionText(RULE_IDS.testConsoleOutput, file),
    }),
    classification: 'enforceable',
    ...consoleTokens(message),
  };
}

export function testConsoleFindings(
  report: { readonly entries: readonly unknown[] },
  {
    analyzerName,
    allow,
    exceptions,
  }: {
    readonly analyzerName: string;
    readonly allow?: unknown;
    readonly exceptions?: readonly unknown[] | undefined;
  },
): Finding[] {
  return newMessages(
    { entries: report.entries.filter(isConsoleEntry) },
    {
      allow: listOf(allow).filter(isAllowEntry),
      exceptions: (exceptions ?? []).filter(isExceptionRule),
    },
  )
    .toSorted(
      (left, right) =>
        left.file.localeCompare(right.file) || left.message.localeCompare(right.message),
    )
    .map((message) => findingFor(message, analyzerName));
}
