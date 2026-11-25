import { readFileSync } from 'node:fs';
import path from 'node:path';
import { escapeGlob, exceptionEntryText } from '../messages/exception-sentence.mts';
import {
  FILE_LIMIT_DEFAULTS,
  GREW_MESSAGES,
  HELD_MESSAGES,
  MESSAGES,
  RULE_IDS,
  messageFields,
  renderMessage,
} from '../policy.mts';
import { allowedFormField, definedField, type MessageValues } from '../messages/messages.mts';
import { containedPath } from '../paths/contained-path.mts';
import { exceptionMatcher } from './exceptions.mts';
import type { Finding } from '../values/findings.mts';
import { fieldOf, fieldsOf, optionalText, textOf } from '../values/readers.mts';
import { hash, occurrenceCounter } from './finding-parts.mts';

type LimitFile = {
  readonly path: string;
  readonly text: string;
  readonly kind?: string | undefined;
  readonly countsInFolder?: false;
};

export type CheckName = keyof typeof MESSAGES & keyof typeof GREW_MESSAGES;

type LimitOptions = {
  readonly analyzerName: string;
  readonly thresholds?: unknown;
  readonly exceptions?: readonly unknown[] | undefined;
  readonly checks?: readonly string[] | undefined;
};

type Messages = {
  readonly message: string;
  readonly allowedForm?: string | undefined;
  readonly worseMessage: string;
  readonly worseAllowedForm?: string;
  readonly heldMessage: string;
};

type Context = {
  readonly analyzerName: string;
  readonly limits: typeof FILE_LIMIT_DEFAULTS;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
};

type RatchetedInput = {
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly key: string;
  readonly value: number;
  readonly messages: Messages;
  readonly pathIsFolder?: true | undefined;
  readonly folderFiles?: unknown;
};

const FILE_LINES = 'fileLines';
const LINE_LENGTH = 'lineLength';
const FOLDER_FILES = 'folderFiles';
const BASE_PLACEHOLDER = '{base}';

const FILE_LIMIT_CHECKS = [FILE_LINES, LINE_LENGTH, FOLDER_FILES];

export const TEST_DATA_FOLDER = /(?:^|\/)(?:__)?fixtures(?:__)?\//u;
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

export function collectFileLimitFindings(
  projectRoot: string,
  entries: readonly object[],
  options: LimitOptions,
): Finding[] {
  const files = entries.map((entry) => {
    const entryPath = textOf(fieldOf(entry, 'path'));
    const root = path.resolve(projectRoot);
    const fullPath = containedPath(root, entryPath, {
      outside: (relative) => `File limit entry ${relative} is outside ${root}`,
    });
    return {
      path: entryPath,
      kind: optionalText(fieldOf(entry, 'kind')),
      ...(fieldOf(entry, 'countsInFolder') === false ? { countsInFolder: false as const } : {}),
      text: readFileSync(fullPath, 'utf8'),
    };
  });
  return evaluateFileLimits(files, options);
}

export function evaluateFileLimits(files: readonly LimitFile[], options: LimitOptions): Finding[] {
  const context: Context = {
    analyzerName: options.analyzerName,
    limits: { ...FILE_LIMIT_DEFAULTS, ...fieldsOf(options.thresholds) },
    isExcepted: exceptionMatcher(options.exceptions ?? []),
  };
  const checked = [...new Map(files.map((file) => [file.path, file])).values()].filter(
    (file) => file.kind !== 'test' || !TEST_DATA_FOLDER.test(file.path),
  );
  const checks = options.checks ?? FILE_LIMIT_CHECKS;
  return [
    ...(checks.includes(FILE_LINES)
      ? checked.flatMap((file) => fileLineFindings(file, context))
      : []),
    ...(checks.includes(LINE_LENGTH) ? checked.flatMap((file) => lineFindings(file, context)) : []),
    ...(checks.includes(FOLDER_FILES) ? folderFindings(checked, context) : []),
  ];
}

function lineCount(text: string): number {
  const lines = text.split(/\r?\n/u);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function fileLineFindings(file: LimitFile, context: Context): Finding[] {
  const limit = file.kind === 'test' ? context.limits.testFileLines : context.limits.fileLines;
  const value = lineCount(file.text);
  if (value <= limit || context.isExcepted(RULE_IDS.fileLines, file.path)) {
    return [];
  }
  const exception = exceptionEntryText({ rule: RULE_IDS.fileLines, path: file.path });
  return [
    ratchetedFinding(context, {
      rule: RULE_IDS.fileLines,
      path: file.path,
      identity: `file-lines:${String(value)}`,
      key: 'file-lines',
      value,
      messages: messagesFor(FILE_LINES, { value, limit, exception, base: BASE_PLACEHOLDER }),
    }),
  ];
}

function lineFindings(file: LimitFile, context: Context): Finding[] {
  const limit = context.limits.lineLength;
  if (context.isExcepted(RULE_IDS.lineLength, file.path)) {
    return [];
  }
  const exception = exceptionEntryText({ rule: RULE_IDS.lineLength, path: file.path });
  const nextOccurrence = occurrenceCounter();
  return file.text.split(/\r?\n/u).flatMap((text, index) => {
    const value = Array.from(text).length;
    if (value <= limit || isUnbreakable(text, limit)) {
      return [];
    }
    const digest = hash(text.trim());
    const occurrence = String(nextOccurrence(digest));
    const finding = ratchetedFinding(context, {
      rule: RULE_IDS.lineLength,
      path: file.path,
      identity: `line:${digest}:occurrence:${occurrence}`,
      key: 'long-line',
      value,
      messages: messagesFor(LINE_LENGTH, { value, limit, exception, base: BASE_PLACEHOLDER }),
    });
    return [{ ...finding, location: { line: index + 1 } }];
  });
}

function isUnbreakable(text: string, limit: number): boolean {
  return IMPORT_LINES.some((pattern) => pattern.test(text.trim())) || countedLength(text) <= limit;
}

function countedLength(text: string): number {
  const withoutTemplateText = text.replaceAll(
    TEMPLATE_LITERAL,
    (template) => `\`${(template.match(INTERPOLATION) ?? []).join('')}\``,
  );
  return Array.from(withoutTemplateText.replaceAll(QUOTED_STRING, "''").replaceAll(URL, '')).length;
}

function folderFindings(files: readonly LimitFile[], context: Context): Finding[] {
  const counts = new Map<string, number>();
  for (const file of files.filter(({ countsInFolder }) => countsInFolder !== false)) {
    const folder = path.posix.dirname(file.path);
    if (!context.isExcepted(RULE_IDS.folderFiles, file.path, folder)) {
      const key = `${folder}\0${textOf(file.kind)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const limit = context.limits.folderFiles;
  return [...counts]
    .filter(([, value]) => value > limit)
    .map(([key, value]) => folderFinding(context, { key, value, limit }));
}

function folderFinding(
  context: Context,
  { key, value, limit }: { readonly key: string; readonly value: number; readonly limit: number },
): Finding {
  const [folder = '', kind = ''] = key.split('\0');
  const glob = folder === '.' ? '*' : `${escapeGlob(folder)}/*`;
  const exception = exceptionEntryText({ rule: RULE_IDS.folderFiles, glob });
  return ratchetedFinding(context, {
    rule: RULE_IDS.folderFiles,
    path: folder,
    identity: `folder-files:${kind}:${String(value)}`,
    key: `folder-files:${kind}`,
    value,
    messages: messagesFor(FOLDER_FILES, { value, kind, limit, exception, base: BASE_PLACEHOLDER }),
    pathIsFolder: true,
  });
}

export function isCheckName(name: string): name is CheckName {
  return (
    Object.hasOwn(MESSAGES, name) &&
    Object.hasOwn(GREW_MESSAGES, name) &&
    Object.hasOwn(HELD_MESSAGES, name)
  );
}

export function messagesFor(name: CheckName, values: MessageValues): Messages {
  const worse = messageFields(GREW_MESSAGES[name], values);
  const shown = messageFields(MESSAGES[name], values);
  return {
    message: textOf(shown['message']),
    allowedForm: shown['allowedForm'],
    worseMessage: textOf(worse['message']),
    ...definedField('worseAllowedForm', worse['allowedForm']),
    heldMessage: renderMessage(HELD_MESSAGES[name], values),
  };
}

export function ratchetedFinding(
  context: { readonly analyzerName: string },
  {
    rule,
    path: findingPath,
    identity,
    key,
    value,
    messages,
    pathIsFolder,
    folderFiles,
  }: RatchetedInput,
): Finding {
  return {
    tool: context.analyzerName,
    rule,
    path: findingPath,
    identity,
    message: messages.message,
    ...allowedFormField(messages.allowedForm),
    classification: 'enforceable',
    ratchet: {
      key,
      value,
      worseMessage: messages.worseMessage,
      ...definedField('worseAllowedForm', messages.worseAllowedForm),
      heldMessage: messages.heldMessage,
      ...(pathIsFolder ? { pathIsFolder } : {}),
      ...(folderFiles === undefined ? {} : { folderFiles }),
    },
  };
}
