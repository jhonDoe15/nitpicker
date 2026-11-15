import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { stripAnsi as untypedStripAnsi } from '../../../../shared/rules/console/ansi.mjs';
import { MAX_CONTENT_LENGTH } from '../../adapters/test-runners/v8-coverage/loaded-sources.cjs';

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

const stripAnsi: (text: string) => string = untypedStripAnsi;

export const REPORT_VARIABLE = 'NITPICKER_TEST_CONSOLE_REPORT';

export const ROOT_VARIABLE = 'NITPICKER_TEST_CONSOLE_ROOT';

export {
  LINES_VARIABLE,
  RUNNER_VARIABLE,
} from '../../adapters/test-runners/v8-coverage/loaded-sources.cjs';

export type ConsoleEntry = {
  readonly file: string;
  readonly test: string;
  readonly messages: string[];
};

type ConsoleEntryInput = {
  readonly content: string;
  readonly root: string;
  readonly file: string;
  readonly test: string;
};

const EMPTY_LINE = '<empty line>';

const STACK_LINE = /^\s+(?:at|in)\s/u;

function realOrGiven(directory: string): string {
  return existsSync(directory) ? realpathSync(directory) : directory;
}

const PATH_CHARACTER = String.raw`[\w.@+~$%-]`;

function prefixesOf(directory: string): string[] {
  return [...new Set([directory, realOrGiven(directory)])]
    .filter((prefix) => prefix.length > 1)
    .map((prefix) => `(?<!${PATH_CHARACTER})${escapeRegExp(prefix)}(?![\\w-])`);
}

const TEMPORARY_REST = String.raw`[^\s'"\x60)\]}>,;]*`;

function withPlaceholders(text: string, root: string): string {
  const rules = [
    ...prefixesOf(root).map((prefix) => [prefix, '<root>'] as const),
    ...prefixesOf(tmpdir()).map((prefix) => [`${prefix}${TEMPORARY_REST}`, '<tmp>'] as const),
    ...prefixesOf(homedir()).map((prefix) => [prefix, '<home>'] as const),
  ];
  return rules.reduce(
    (current, [source, placeholder]) => current.replaceAll(new RegExp(source, 'gu'), placeholder),
    text,
  );
}

function startsBlock(line: string): boolean {
  return /^[^\s\])}]/u.test(line);
}

function blocksOf(lines: string[]): string[][] {
  return lines.reduce<string[][]>(
    (blocks, line) =>
      blocks.length === 0 || startsBlock(line)
        ? [...blocks, [line]]
        : [...blocks.slice(0, -1), [...(blocks.at(-1) ?? []), line]],
    [],
  );
}

function isMessageLine(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line) && !STACK_LINE.test(line) && line.trim() !== EMPTY_LINE;
}

function withoutGroupIndent(lines: string[]): string[] {
  const indent = /^\s*/u.exec(lines[0] ?? '')?.[0] ?? '';
  return lines.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line));
}

export function consoleMessagesOf(content: string): string[] {
  return blocksOf(withoutGroupIndent(stripAnsi(content).split(/\r?\n/u)))
    .map((block) => block.filter((line) => isMessageLine(line)).map((line) => line.trim()))
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join(' '));
}

export function consoleEntry({
  content,
  root,
  file,
  test,
}: ConsoleEntryInput): ConsoleEntry | undefined {
  const messages = consoleMessagesOf(withPlaceholders(content.slice(0, MAX_CONTENT_LENGTH), root));
  return messages.length === 0 ? undefined : { file, test, messages };
}

export function writeReportFile(reportPath: string, entries: readonly unknown[]): void {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ entries })}\n`);
}
