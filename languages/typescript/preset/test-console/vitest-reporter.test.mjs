import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import testConsoleReporter, {
  REPORT_VARIABLE,
  consoleMessagesOf,
} from './vitest-reporter.config.mjs';

const ROOT = '/work/app';
const moduleEntity = { type: 'module', moduleId: `${ROOT}/test/a.test.ts` };
const testEntity = { type: 'test', fullName: 'suite > works', module: moduleEntity };

describe('the vitest console reporter', () => {
  let reportPath;

  beforeEach(() => {
    reportPath = path.join(mkdtempSync(path.join(tmpdir(), 'reporter-')), 'out', 'report.json');
    vi.stubEnv(REPORT_VARIABLE, reportPath);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(path.dirname(path.dirname(reportPath)), { recursive: true, force: true });
  });

  function entriesFor(logs, { config = {}, entities = {} } = {}) {
    const reporter = new testConsoleReporter();
    reporter.onInit({
      config: { root: ROOT, ...config },
      state: { getReportedEntityById: (id) => entities[id] },
    });
    for (const log of logs) {
      reporter.onUserConsoleLog({ type: 'stderr', taskId: 't', ...log });
    }
    reporter.onTestRunEnd();
    return JSON.parse(readFileSync(reportPath, 'utf8')).entries;
  }

  it('keeps standard error only, and attributes it to the file and test', () => {
    const logs = [
      { content: 'printed with console.log\n', type: 'stdout' },
      { content: 'Warning: leaked timer\n', taskId: 'test' },
      { content: 'Global warning\n', taskId: 'module' },
    ];

    expect(entriesFor(logs, { entities: { test: testEntity, module: moduleEntity } })).toEqual([
      {
        file: `${ROOT}/test/a.test.ts`,
        test: 'suite > works',
        messages: ['Warning: leaked timer'],
      },
      { file: `${ROOT}/test/a.test.ts`, test: '', messages: ['Global warning'] },
    ]);
  });

  it('attributes output from an unknown task to no file', () => {
    expect(entriesFor([{ content: 'Orphan warning\n', taskId: 'gone' }])).toEqual([
      { file: '', test: '', messages: ['Orphan warning'] },
    ]);
  });

  it('skips a log the project filters out with onConsoleLog', () => {
    const onConsoleLog = vi.fn((content) => !content.startsWith('Known'));
    const logs = [{ content: 'Known noise\n', taskId: 'test' }, { content: 'New noise\n' }];

    const entries = entriesFor(logs, { config: { onConsoleLog }, entities: { test: testEntity } });

    expect(entries.map(({ messages }) => messages)).toEqual([['New noise']]);
    expect(onConsoleLog).toHaveBeenCalledWith('Known noise\n', 'stderr', testEntity);
  });

  it('replaces the project, temporary and home directories with placeholders', () => {
    const content = `in ${ROOT}/src\nopen ${tmpdir()}/scratch-x1/file\nhome ${homedir()}/.cache\n`;

    expect(entriesFor([{ content }])[0].messages).toEqual([
      'in <root>/src',
      'open <tmp>',
      'home <home>/.cache',
    ]);
  });

  it('leaves a path that only starts like a directory alone', () => {
    const content = `${ROOT}lication/x\n${ROOT}/x\n/before${ROOT}/x\n${tmpdir()}-other/y\n`;

    expect(entriesFor([{ content }])[0].messages).toEqual([
      `${ROOT}lication/x`,
      '<root>/x',
      `/before${ROOT}/x`,
      `${tmpdir()}-other/y`,
    ]);
  });

  it('cuts a long log to 4000 characters', () => {
    const [{ messages }] = entriesFor([{ content: 'a'.repeat(5000) }]);

    expect(messages[0]).toHaveLength(4000);
  });

  it('writes nothing when the report variable is not set', () => {
    vi.stubEnv(REPORT_VARIABLE, '');
    const reporter = new testConsoleReporter();
    reporter.onInit({ config: { root: ROOT }, state: { getReportedEntityById: () => undefined } });
    reporter.onUserConsoleLog({ type: 'stderr', content: 'x\n' });
    reporter.onTestRunEnd();

    expect(existsSync(reportPath)).toBe(false);
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
