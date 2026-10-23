import { existsSync, symlinkSync } from 'node:fs';
import { format } from 'prettier';
import { describe, expect, it } from 'vitest';
import { useProjects, readText } from '../test-support/projects.mjs';
import { placeConfig, renderConfig } from './config-file.mjs';

const project = useProjects();

describe('rendered config', () => {
  it('is what the repository Prettier config makes of the JSON', async () => {
    const options = { parser: 'json', singleQuote: true, trailingComma: 'all', printWidth: 100 };

    expect(await format(JSON.stringify({ preset: 'typescript' }), options)).toBe(
      renderConfig({ preset: 'typescript' }),
    );
  });

  it('is one line per config', () => {
    expect(renderConfig({ preset: 'python' })).toBe('{ "preset": "python" }\n');
    expect(renderConfig({ preset: 'java', base: 'origin/main' })).toBe(
      '{ "preset": "java", "base": "origin/main" }\n',
    );
  });
});

describe('placing the config', () => {
  it('creates the file when there is none', () => {
    const root = project({});

    expect(placeConfig(root, 'java')).toEqual({
      relative: 'nitpicker.config.json',
      status: 'created',
    });
    expect(readText(root, 'nitpicker.config.json')).toBe('{ "preset": "java" }\n');
  });

  it('leaves a file that already sets the preset, whatever else it holds', () => {
    const text = '{\n  "preset": "kotlin",\n  "disable": ["mutation"]\n}\n';
    const root = project({ 'nitpicker.config.json': text });

    expect(placeConfig(root, 'kotlin').status).toBe('unchanged');
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('leaves a file without a preset on a TypeScript project, the default preset', () => {
    const text = '{\n  "disable": ["mutation"]\n}\n';
    const root = project({ 'nitpicker.config.json': text });

    expect(placeConfig(root, 'typescript')).toEqual({
      relative: 'nitpicker.config.json',
      status: 'unchanged',
    });
  });

  it('reads a file with Windows line endings like any other', () => {
    const root = project({ 'nitpicker.config.json': '{ "preset": "typescript" }\r\n' });

    expect(placeConfig(root, 'javascript').diff).toBe(
      [
        '--- nitpicker.config.json',
        '+++ nitpicker.config.json (nitpicker init)',
        '@@ -1,1 +1,1 @@',
        '-{ "preset": "typescript" }',
        '+{ "preset": "javascript" }',
        '',
      ].join('\n'),
    );
  });

  it('never overwrites a file that sets another preset, and diffs only the preset', () => {
    const text = '{\n  "preset": "typescript",\n  "disable": ["mutation"]\n}\n';
    const root = project({ 'nitpicker.config.json': text });

    expect(placeConfig(root, 'javascript')).toEqual({
      relative: 'nitpicker.config.json',
      status: 'differs',
      reason: 'It sets "preset": "typescript", and this project needs "preset": "javascript".',
      diff: [
        '--- nitpicker.config.json',
        '+++ nitpicker.config.json (nitpicker init)',
        '@@ -1,4 +1,4 @@',
        ' {',
        '-  "preset": "typescript",',
        '+  "preset": "javascript",',
        '   "disable": ["mutation"]',
        ' }',
        '',
      ].join('\n'),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('adds the preset to a file without one and keeps every other key', () => {
    const text = '{\n  "disable": ["mutation"],\n  "layout": { "sourceRoots": ["lib"] }\n}\n';
    const root = project({ 'nitpicker.config.json': text });

    expect(placeConfig(root, 'python')).toEqual({
      relative: 'nitpicker.config.json',
      status: 'differs',
      reason: 'It sets no preset: add "preset": "python".',
      diff: [
        '--- nitpicker.config.json',
        '+++ nitpicker.config.json (nitpicker init)',
        '@@ -1,4 +1,5 @@',
        ' {',
        '+  "preset": "python",',
        '   "disable": ["mutation"],',
        '   "layout": { "sourceRoots": ["lib"] }',
        ' }',
        '',
      ].join('\n'),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it.each([
    ['{}\n', '+{ "preset": "java" }'],
    ['{ "base": "main" }\n', '+{ "preset": "java", "base": "main" }'],
    ['{"base":"main"}\n', '+{"preset": "java", "base":"main"}'],
  ])('adds the preset to the one-line file %j', (text, added) => {
    const root = project({ 'nitpicker.config.json': text });

    expect(placeConfig(root, 'java').diff.split('\n').slice(3)).toEqual([
      `-${text.trimEnd()}`,
      added,
      '',
    ]);
  });

  it('never overwrites a file that is not a JSON object', () => {
    const root = project({ 'nitpicker.config.json': '{ preset: python' });

    expect(placeConfig(root, 'python')).toEqual({
      relative: 'nitpicker.config.json',
      status: 'differs',
      reason: 'It is not a JSON object, so init cannot add the preset to it.',
      diff: [
        '--- nitpicker.config.json',
        '+++ nitpicker.config.json (nitpicker init)',
        '@@ -1,1 +1,1 @@',
        '-{ preset: python',
        '+{ "preset": "python" }',
        '',
      ].join('\n'),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe('{ preset: python');
  });

  it('refuses to write through a link that leaves the project', () => {
    const root = project({});
    const outside = project({});
    symlinkSync(`${outside}/config.json`, `${root}/nitpicker.config.json`);

    expect(() => placeConfig(root, 'java')).toThrow(
      'nitpicker.config.json is a symbolic link to a missing file, so nitpicker init does not write through it. Replace the link with a file, or make the change by hand.',
    );
    expect(existsSync(`${outside}/config.json`)).toBe(false);
  });
});
