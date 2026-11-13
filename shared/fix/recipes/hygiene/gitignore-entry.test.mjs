import { describe, expect, it } from 'vitest';
import { gitignoreEdit, ignoreEntry } from './gitignore-entry.mjs';

describe('ignoreEntry', () => {
  it.each([
    ['.env', false, '/.env'],
    ['build', true, '/build/'],
    ['a b/c*.txt', false, String.raw`/a b/c\*.txt`],
    ['#notes', false, String.raw`/\#notes`],
  ])('anchors %s at the project root', (name, directory, expected) => {
    expect(ignoreEntry(name, { directory })).toBe(expected);
  });
});

describe('gitignoreEdit', () => {
  it('creates the file when there is none or it is empty', () => {
    const create = { type: 'write', path: '.gitignore', text: '/.env\n' };

    expect([gitignoreEdit(undefined, '/.env'), gitignoreEdit('', '/.env')]).toEqual([
      create,
      create,
    ]);
  });

  it('appends one line at the end and keeps the line endings', () => {
    expect(gitignoreEdit('a\n', '/.env')).toEqual({
      type: 'replace',
      path: '.gitignore',
      start: 2,
      end: 2,
      text: '/.env\n',
    });
    expect(gitignoreEdit('a\r\nb', '/.env').text).toBe('\r\n/.env\r\n');
  });

  it.each([
    ['the same entry', '/.env\n'],
    ['the name without the slash', 'x\n.env\n'],
    ['a folder entry without its slash', '/build\n'],
  ])('adds nothing when the file has %s', (_, text) => {
    expect(gitignoreEdit(text, text.includes('build') ? '/build/' : '/.env')).toBeUndefined();
  });
});
