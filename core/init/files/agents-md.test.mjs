import { symlinkSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readText, useProjects } from '../test-support/projects.mjs';
import { appendSnippet, readSnippet } from './agents-md.mjs';

const project = useProjects();

describe('agent guidance snippet', () => {
  it('is the part of docs/agents-snippet.md after the separator', () => {
    const snippet = readSnippet();
    const headings = snippet.split('\n').filter((line) => line.startsWith('#'));

    expect(headings).toEqual([
      '## Quality gate (nitpicker)',
      '### Run it',
      '### Exit codes',
      '### Read the report',
      '### Handle a finding',
    ]);
    expect(snippet.endsWith('\n')).toBe(false);
  });

  it('creates AGENTS.md when no instruction file exists', () => {
    const root = project({});

    expect(appendSnippet(root)).toEqual({ relative: 'AGENTS.md', status: 'created' });
    expect(readText(root, 'AGENTS.md')).toBe(`${readSnippet()}\n`);
  });

  it('appends after the existing text of AGENTS.md', () => {
    const root = project({ 'AGENTS.md': '# Rules\n\nBe kind.\n\n\n' });

    expect(appendSnippet(root)).toEqual({ relative: 'AGENTS.md', status: 'appended' });
    expect(readText(root, 'AGENTS.md')).toBe(`# Rules\n\nBe kind.\n\n${readSnippet()}\n`);
  });

  it('uses CLAUDE.md when only that exists', () => {
    const root = project({ 'CLAUDE.md': '# Notes\n' });

    expect(appendSnippet(root)).toEqual({ relative: 'CLAUDE.md', status: 'appended' });
    expect(readText(root, 'CLAUDE.md')).toBe(`# Notes\n\n${readSnippet()}\n`);
  });

  it('prefers AGENTS.md when both exist', () => {
    const root = project({ 'AGENTS.md': 'a\n', 'CLAUDE.md': 'b\n' });

    expect(appendSnippet(root).relative).toBe('AGENTS.md');
    expect(readText(root, 'CLAUDE.md')).toBe('b\n');
  });

  it('writes the snippet once, however often it runs', () => {
    const root = project({ 'AGENTS.md': '# Rules\n' });
    appendSnippet(root);
    const afterFirst = readText(root, 'AGENTS.md');

    expect(appendSnippet(root)).toEqual({ relative: 'AGENTS.md', status: 'unchanged' });
    expect(readText(root, 'AGENTS.md')).toBe(afterFirst);
  });

  it('finds the snippet in CLAUDE.md as well', () => {
    const root = project({ 'AGENTS.md': 'a\n', 'CLAUDE.md': `${readSnippet()}\n` });

    expect(appendSnippet(root)).toEqual({ relative: 'CLAUDE.md', status: 'unchanged' });
    expect(readText(root, 'AGENTS.md')).toBe('a\n');
  });

  it('treats an empty instruction file as a new one', () => {
    const root = project({ 'AGENTS.md': '\n' });
    appendSnippet(root);

    expect(readText(root, 'AGENTS.md')).toBe(`${readSnippet()}\n`);
  });

  it('appends with the Windows line endings of the existing file', () => {
    const root = project({ 'CLAUDE.md': '# Mine\r\nline\r\n' });
    appendSnippet(root);

    expect(readText(root, 'CLAUDE.md')).toBe(
      `# Mine\r\nline\r\n\r\n${readSnippet().replaceAll('\n', '\r\n')}\r\n`,
    );
    expect(appendSnippet(root)).toEqual({ relative: 'CLAUDE.md', status: 'unchanged' });
  });

  it('refuses to append through a link to a file outside the project', () => {
    const root = project({});
    const outside = project({ 'notes.md': 'mine\n' });
    symlinkSync(`${outside}/notes.md`, `${root}/AGENTS.md`);

    expect(() => appendSnippet(root)).toThrow(
      `AGENTS.md resolves through a symbolic link to ${outside}/notes.md, outside ${root}, so nitpicker init does not write through it. Replace the link with a file, or make the change by hand.`,
    );
    expect(readText(outside, 'notes.md')).toBe('mine\n');
  });
});
