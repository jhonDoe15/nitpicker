import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { stripAnsi } from '../../../../shared/rules/console/ansi.mjs';

export const REPORT_VARIABLE = 'NITPICKER_TEST_CONSOLE_REPORT';

export const ROOT_VARIABLE = 'NITPICKER_TEST_CONSOLE_ROOT';

const MAX_CONTENT_LENGTH = 4000;

const EMPTY_LINE = '<empty line>';

const STACK_LINE = /^\s+(?:at|in)\s/u;

function realOrGiven(directory) {
  return existsSync(directory) ? realpathSync(directory) : directory;
}

const PATH_CHARACTER = String.raw`[\w.@+~$%-]`;

function prefixesOf(directory) {
  return [...new Set([directory, realOrGiven(directory)])]
    .filter((prefix) => prefix.length > 1)
    .map((prefix) => `(?<!${PATH_CHARACTER})${escapeRegExp(prefix)}(?![\\w-])`);
}

const TEMPORARY_REST = String.raw`[^\s'"\x60)\]}>,;]*`;

function withPlaceholders(text, root) {
  const rules = [
    ...prefixesOf(root).map((prefix) => [prefix, '<root>']),
    ...prefixesOf(tmpdir()).map((prefix) => [`${prefix}${TEMPORARY_REST}`, '<tmp>']),
    ...prefixesOf(homedir()).map((prefix) => [prefix, '<home>']),
  ];
  return rules.reduce(
    (current, [source, placeholder]) => current.replaceAll(new RegExp(source, 'gu'), placeholder),
    text,
  );
}

function startsBlock(line) {
  return /^[^\s\])}]/u.test(line);
}

function blocksOf(lines) {
  return lines.reduce(
    (blocks, line) =>
      blocks.length === 0 || startsBlock(line)
        ? [...blocks, [line]]
        : [...blocks.slice(0, -1), [...blocks.at(-1), line]],
    [],
  );
}

function isMessageLine(line) {
  return /[\p{L}\p{N}]/u.test(line) && !STACK_LINE.test(line) && line.trim() !== EMPTY_LINE;
}

export function consoleMessagesOf(content) {
  return blocksOf(stripAnsi(content).split(/\r?\n/u))
    .map((block) => block.filter((line) => isMessageLine(line)).map((line) => line.trim()))
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join(' '));
}

export function consoleEntry({ content, root, file, test }) {
  const messages = consoleMessagesOf(withPlaceholders(content.slice(0, MAX_CONTENT_LENGTH), root));
  return messages.length === 0 ? undefined : { file, test, messages };
}

export function writeReportFile(reportPath, entries) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ entries })}\n`);
}
