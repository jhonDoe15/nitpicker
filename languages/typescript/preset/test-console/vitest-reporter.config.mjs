import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { stripAnsi } from './ansi.mjs';

export const REPORT_VARIABLE = 'NITPICKER_TEST_CONSOLE_REPORT';

const MAX_CONTENT_LENGTH = 4000;

const EMPTY_LINE = '<empty line>';

function realOrGiven(directory) {
  return existsSync(directory) ? realpathSync(directory) : directory;
}

function prefixesOf(directory) {
  return [...new Set([directory, realOrGiven(directory)])]
    .filter((prefix) => prefix.length > 1)
    .map(escapeRegExp);
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

function blocksOf(lines, writes) {
  if (writes === 1) {
    return [lines];
  }
  return lines.reduce(
    (blocks, line) =>
      blocks.length === 0 || startsBlock(line)
        ? [...blocks, [line]]
        : [...blocks.slice(0, -1), [...blocks.at(-1), line]],
    [],
  );
}

export function consoleMessagesOf(content, writes) {
  return blocksOf(stripAnsi(content).split(/\r?\n/u), writes)
    .map((block) => block.find((line) => /[\p{L}\p{N}]/u.test(line)))
    .filter((line) => line !== undefined && line.trim() !== EMPTY_LINE)
    .map((line) => line.trim());
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

export default function TestConsoleReporter() {
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
      const messages = consoleMessagesOf(content, log.size);
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
