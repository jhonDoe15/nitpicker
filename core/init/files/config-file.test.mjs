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

  it('never overwrites a file that sets another preset, and returns the diff', () => {
    const text = '{ "preset": "typescript" }\n';
    const root = project({ 'nitpicker.config.json': text });
    const result = placeConfig(root, 'javascript');

    expect(result.status).toBe('differs');
    expect(result.diff).toBe(
      [
        '--- nitpicker.config.json',
        '+++ nitpicker.config.json (nitpicker init)',
        '@@ -1,1 +1,1 @@',
        '-{ "preset": "typescript" }',
        '+{ "preset": "javascript" }',
        '',
      ].join('\n'),
    );
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('never overwrites a file without a preset', () => {
    const text = '{\n  "disable": ["mutation"]\n}\n';
    const root = project({ 'nitpicker.config.json': text });
    const result = placeConfig(root, 'python');

    expect(result).toEqual({
      relative: 'nitpicker.config.json',
      status: 'differs',
      diff: [
        '--- nitpicker.config.json',
        '+++ nitpicker.config.json (nitpicker init)',
        '@@ -1,3 +1,1 @@',
        '-{',
        '-  "disable": ["mutation"]',
        '-}',
        '+{ "preset": "python" }',
        '',
      ].join('\n'),
    });
    expect(readText(root, 'nitpicker.config.json')).toBe(text);
  });

  it('never overwrites a file that is not valid JSON', () => {
    const root = project({ 'nitpicker.config.json': '{ preset: python' });

    expect(placeConfig(root, 'python').status).toBe('differs');
    expect(readText(root, 'nitpicker.config.json')).toBe('{ preset: python');
  });
});
