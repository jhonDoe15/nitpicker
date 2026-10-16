import { describe, expect, it } from 'vitest';
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
