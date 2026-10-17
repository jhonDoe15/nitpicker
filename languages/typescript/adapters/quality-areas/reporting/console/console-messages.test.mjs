import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { hasSpecificText, normalizeConsoleMessage } from './console-messages.mjs';

describe('console message normalization', () => {
  it.each([
    [
      'an absolute path with a position',
      'Failed to load /home/ci/work/app/src/main/widget.ts:42:7',
      'Failed to load widget.ts:<n>:<n>',
    ],
    [
      'an absolute path with no extension',
      'cannot read config in /tmp/nitpicker-diff-AbC123/head',
      'cannot read config in head',
    ],
    ['a path after a placeholder', 'using <tmp>/scratch/out.txt', 'using out.txt'],
    ['a bare placeholder', 'cwd is <root>', 'cwd is <root>'],
    [
      'a file URL and a Windows path',
      'at file:///tmp/a.mjs and C:\\Users\\ci\\b.js',
      'at a.mjs and b.js',
    ],
    ['a process id', 'worker pid 4821 started', 'worker pid <n> started'],
    ['epoch seconds and milliseconds', 'ts 1792144412 and 1792144412345', 'ts <n> and <n>'],
    [
      'a duration in seconds',
      'took 0.766s then 12 ms then 3 minutes',
      'took <n> then <n> then <n>',
    ],
    ['a random float', 'retry in 0.4231987 seconds', 'retry in <n>'],
    [
      'a counter',
      '11 listeners added to emitter, 12 sockets',
      '<n> listeners added to emitter, <n> sockets',
    ],
    ['sizes and percentages', 'read 3 MB of 12KB at 45%', 'read <n> of <n> at <n>'],
    [
      'ids joined by underscores and hyphens',
      'job V1StGXR8_Z5jdHi6B-myTqq9Lxw failed',
      'job <id>_<id>-<id> failed',
    ],
    ['a random identifier in an object', "{ id: 'k3j2h1', ok: true }", "{ id: '<id>', ok: true }"],
    [
      'an ISO timestamp, a hex address and a UUID',
      'at 2026-10-16T12:30:45.123Z 0x7f3a9c1 123e4567-e89b-12d3-a456-426614174000',
      'at <time> <hex> <uuid>',
    ],
    [
      'terminal colors and spacing',
      '\u001B[33mWarning:\u001B[39m   two   spaces',
      'Warning: two spaces',
    ],
  ])('replaces %s', (_name, line, expected) => {
    expect(normalizeConsoleMessage(line)).toBe(expected);
  });

  it('keeps URLs and names that only contain digits', () => {
    const line = 'GET http://example.test/v2/items failed in ES module v2';

    expect(normalizeConsoleMessage(line)).toBe(line);
  });

  it('keeps the first 300 characters', () => {
    expect(normalizeConsoleMessage('x'.repeat(500))).toHaveLength(300);
  });

  it('gives the same message when only paths, numbers and times differ', () => {
    const before = 'Warning: timer fired in /a/b/src/x.ts:10:2 at 2026-01-01T00:00:00Z (pid 4)';
    const after = 'Warning: timer fired in /other/src/x.ts:99:5 at 2026-02-03T04:05:06Z (pid 91)';

    expect(normalizeConsoleMessage(before)).toBe(normalizeConsoleMessage(after));
  });
});

function randomPicker(seed) {
  let state = seed;
  return (alphabet, length) =>
    Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return alphabet[Math.floor((state / 2 ** 32) * alphabet.length)];
    }).join('');
}

describe('random temporary names', () => {
  const pick = randomPicker(20261017);
  const PYTHON_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789_';
  const NODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  it.each([
    ['a Python temporary file', 'cannot open /tmp/tmpab3_x9qz.txt', 'cannot open <id>.txt'],
    ['a Python temporary directory', 'rm <tmp>/tmpqwertyui failed', 'rm <id> failed'],
    ['a Python name in a message', 'wrote tmp_____ab to disk', 'wrote <id> to disk'],
    ['a shell temporary name', 'using tmp.X7kQp2LmNz', 'using <id>'],
    ['a Node temporary directory', 'ENOENT <tmp>/app-AbCdEf/out.json', 'ENOENT out.json'],
    ['a Node temporary directory as the end', 'ENOENT <tmp>/app-AbCdEf', 'ENOENT <id>'],
    ['a raw temporary directory', 'rm /var/tmp/session_xYzAbC', 'rm <id>'],
  ])('replaces %s', (_name, line, expected) => {
    expect(normalizeConsoleMessage(line)).toBe(expected);
  });

  it.each([
    ['a short name', 'tmpfile and tmpl are fine', 'tmpfile and tmpl are fine'],
    ['a word inside another', 'attmpabcdefgh stays', 'attmpabcdefgh stays'],
    ['a word under the temporary directory', 'wrote <tmp>/scratch/output', 'wrote output'],
    ['a bare lowercase name', 'wrote <tmp>/output', 'wrote output'],
    ['a name outside the temporary directory', 'wrote /srv/app-output', 'wrote app-output'],
  ])('leaves %s', (_name, line, expected) => {
    expect(normalizeConsoleMessage(line)).toBe(expected);
  });

  it('gives one message for 2000 random Python temporary names', () => {
    const messages = Array.from({ length: 2000 }, () =>
      normalizeConsoleMessage(`No such file: tmp${pick(PYTHON_ALPHABET, 8)}`),
    );

    expect(new Set(messages)).toEqual(new Set(['No such file: <id>']));
  });

  it('gives one message for 2000 random mkdtemp names with and without a file name', () => {
    const directories = Array.from({ length: 2000 }, () => `<tmp>/app-${pick(NODE_ALPHABET, 6)}`);

    expect(new Set(directories.map((name) => normalizeConsoleMessage(`rm ${name}`)))).toEqual(
      new Set(['rm <id>']),
    );
    expect(new Set(directories.map((name) => normalizeConsoleMessage(`${name}/a.log`)))).toEqual(
      new Set(['a.log']),
    );
  });

  it('gives one message for 2000 random names of a real mkdtemp style', () => {
    const names = Array.from({ length: 2000 }, () => `${tmpdir()}/test_${pick(NODE_ALPHABET, 6)}`);
    const messages = names.map((name) => normalizeConsoleMessage(`EACCES: ${name}`));

    expect(new Set(messages)).toEqual(new Set(['EACCES: <id>']));
  });
});

describe('text that can identify a message', () => {
  it.each([
    ['is no longer supported', true],
    ['Error: 404', true],
    ['404', false],
    ['<n> <id>', false],
    ['  a b  ', false],
    ['\u001B[31m\u001B[0m', false],
    ['/var/tmp/x', false],
  ])('judges %j as %s', (text, expected) => {
    expect(hasSpecificText(text)).toBe(expected);
  });
});
