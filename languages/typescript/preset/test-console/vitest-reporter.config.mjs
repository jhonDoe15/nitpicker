import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { stripAnsi } from '../../../../shared/rules/console/ansi.mjs';

export const REPORT_VARIABLE = 'NITPICKER_TEST_CONSOLE_REPORT';

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

function locate(entity) {
  if (entity === undefined) {
    return { file: '', test: '' };
  }
  if (entity.type === 'module') {
    return { file: entity.moduleId, test: '' };
  }
  return { file: entity.module.moduleId, test: entity.fullName };
}

export default function testConsoleReporter() {
  const entries = [];
  let vitest;
  return {
    onInit(context) {
      vitest = context;
    },
    onUserConsoleLog(log) {
      const entity = vitest.state.getReportedEntityById(log.taskId);
      if (
        log.type !== 'stderr' ||
        vitest.config.onConsoleLog?.(log.content, log.type, entity) === false
      ) {
        return;
      }
      const content = withPlaceholders(
        log.content.slice(0, MAX_CONTENT_LENGTH),
        vitest.config.root,
      );
      const messages = consoleMessagesOf(content);
      if (messages.length > 0) {
        entries.push({ ...locate(entity), messages });
      }
    },
    onTestRunEnd() {
      const reportPath = process.env[REPORT_VARIABLE];
      if (reportPath === undefined || reportPath === '') {
        return;
      }
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify({ entries })}\n`);
    },
  };
}
