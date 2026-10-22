import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleEntry, consoleMessagesOf, writeReportFile } from './console-report.mjs';

const ROOT = '/work/app';

function messagesOf(content) {
  return consoleEntry({ content, root: ROOT, file: 'a', test: 't' })?.messages;
}

describe('building a console entry', () => {
  it('replaces the project, temporary and home directories with placeholders', () => {
    const content = `in ${ROOT}/src\nopen ${tmpdir()}/scratch-x1/file\nhome ${homedir()}/.cache\n`;

    expect(messagesOf(content)).toEqual(['in <root>/src', 'open <tmp>', 'home <home>/.cache']);
  });

  it('leaves a path that only starts like a directory alone', () => {
    const content = `${ROOT}lication/x\n${ROOT}/x\n/before${ROOT}/x\n${tmpdir()}-other/y\n`;

    expect(messagesOf(content)).toEqual([
      `${ROOT}lication/x`,
      '<root>/x',
      `/before${ROOT}/x`,
      `${tmpdir()}-other/y`,
    ]);
  });

  it('cuts a long log to 4000 characters', () => {
    expect(messagesOf('a'.repeat(5000))[0]).toHaveLength(4000);
  });

  it('keeps the file and test and gives nothing for text without a letter or digit', () => {
    expect(consoleEntry({ content: 'warn', root: ROOT, file: 'a.test.ts', test: 'works' })).toEqual(
      {
        file: 'a.test.ts',
        test: 'works',
        messages: ['warn'],
      },
    );
    expect(consoleEntry({ content: '{\n}\n', root: ROOT, file: 'a', test: 't' })).toBeUndefined();
  });
});

describe('writing the console report', () => {
  let directory;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'console-report-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('writes the entries to the report, creating its folder', () => {
    const reportPath = path.join(directory, 'out', 'report.json');

    writeReportFile(reportPath, [{ file: 'a', test: '', messages: ['x'] }]);

    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual({
      entries: [{ file: 'a', test: '', messages: ['x'] }],
    });
  });

  it('writes an empty report on request', () => {
    const reportPath = path.join(directory, 'report.json');

    writeReportFile(reportPath, []);

    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual({ entries: [] });
  });
});

describe('splitting one console flush into messages', () => {
  it('joins the lines of one write without closers and blank lines', () => {
    const content = "{\n  level: 'warn',\n  code: 'NEW',\n\n  more: [1, 2]\n}\n";

    expect(consoleMessagesOf(content)).toEqual(["level: 'warn', code: 'NEW', more: [1, 2]"]);
  });

  it('keeps the cause of an error and drops its stack frames', () => {
    const content = [
      'Error: outer',
      '    at run (/a/b.js:1:2)',
      '    at async Promise.all (index 0) {',
      '  [cause]: Error: inner',
      '      at <anonymous>',
      '}',
    ].join('\n');

    expect(consoleMessagesOf(content)).toEqual(['Error: outer [cause]: Error: inner']);
  });

  it('drops component stacks', () => {
    const content = 'Warning: Each child needs a key.\n    in Item (at List.js:4)\n    in List\n';

    expect(consoleMessagesOf(content)).toEqual(['Warning: Each child needs a key.']);
  });

  it('gives a call the same messages alone and in a batch', () => {
    const call = 'The above error occurred in Foo:\n    at Foo (x.tsx:1:1)\n\nReact will try again';
    const other = 'Another warning';

    expect(consoleMessagesOf(`${call}\n${other}\n`)).toEqual([
      ...consoleMessagesOf(call),
      ...consoleMessagesOf(other),
    ]);
    expect(consoleMessagesOf(call)).toEqual([
      'The above error occurred in Foo:',
      'React will try again',
    ]);
  });

  it('gives one message per block of several writes', () => {
    const content = "warn one\nError: boom\n    at run (/a/b.js:1:2)\n{\n  code: 'X'\n}\n]\n";

    expect(consoleMessagesOf(content)).toEqual(['warn one', 'Error: boom', "code: 'X'"]);
  });

  it('drops terminal colors and the placeholder for an empty call', () => {
    expect(consoleMessagesOf('\u001B[33mWarning\u001B[39m\n<empty line>')).toEqual(['Warning']);
  });

  it('gives nothing for a flush without any letter or digit', () => {
    expect(consoleMessagesOf('{\n}\n')).toEqual([]);
  });
});
