import { describe, expect, it } from 'vitest';
import { SAMPLE_LIMIT, conventionChoices, detectConventions } from './detect.mjs';
import { describeConventions, validateConventions } from './settings.mjs';

const indentation = {
  id: 'demo.indentation',
  label: 'Demo indentation',
  options: ['2', '4'],
  optionLabels: { 2: '2 spaces', 4: '4 spaces' },
  fallback: '2',
  files: ['**/*.demo'],
  measure: (text) => /^( +)\S/m.exec(text)?.[1].length.toString(),
};

const sourceOf = (files) => ({
  paths: () => Object.keys(files),
  readMany: (paths) => new Map(paths.map((file) => [file, files[file]])),
});

const detect = (files, options = {}) =>
  detectConventions({ definitions: [indentation], source: sourceOf(files), ...options });

describe('detectConventions', () => {
  it('follows the option most files use', () => {
    const result = detect({
      'a.demo': '{\n    x\n}',
      'b.demo': '{\n    y\n}',
      'c.demo': '{\n  z\n}',
    });

    expect(result['demo.indentation']).toEqual({
      choice: '4',
      source: 'majority',
      counts: { 2: 1, 4: 2 },
    });
  });

  it('falls back to the preset default on a tie or with nothing to measure', () => {
    expect(detect({ 'a.demo': '{\n    x\n}', 'b.demo': '{\n  y\n}' })['demo.indentation']).toEqual({
      choice: '2',
      source: 'default',
      counts: { 2: 1, 4: 1 },
    });
    expect(detect({ 'a.txt': '{\n    x\n}' })['demo.indentation'].source).toBe('default');
  });

  it('uses a pinned value without reading files', () => {
    const source = {
      paths: () => ['a.demo'],
      readMany: (paths) => {
        expect(paths).toEqual([]);
        return new Map();
      },
    };

    expect(
      detectConventions({
        definitions: [indentation],
        source,
        pinned: { 'demo.indentation': '4' },
      }),
    ).toEqual({ 'demo.indentation': { choice: '4', source: 'pinned', counts: {} } });
  });

  it('skips excluded paths and files no option matches', () => {
    const result = detect(
      {
        'gen/a.demo': '{\n    x\n}',
        'gen/b.demo': '{\n    x\n}',
        'c.demo': '{\n  z\n}',
        'd.demo': 'flat',
      },
      { exclude: ['gen/**'] },
    );

    expect(result['demo.indentation']).toEqual({
      choice: '2',
      source: 'majority',
      counts: { 2: 1, 4: 0 },
    });
  });

  it('samples evenly across a large tree', () => {
    const files = Object.fromEntries(
      Array.from({ length: SAMPLE_LIMIT * 2 }, (_, index) => [
        `f${String(index).padStart(4, '0')}.demo`,
        index < SAMPLE_LIMIT ? '{\n  x\n}' : '{\n    x\n}',
      ]),
    );

    expect(detect(files)['demo.indentation'].counts).toEqual({ 2: 200, 4: 200 });
  });

  it('carries only the choices that differ from the preset default', () => {
    expect(conventionChoices(detect({ 'a.demo': '{\n    x\n}' }), [indentation])).toEqual({
      'demo.indentation': '4',
    });
    expect(conventionChoices(detect({ 'a.demo': '{\n  x\n}' }), [indentation])).toEqual({});
  });
});

describe('convention settings', () => {
  it('accepts known conventions and their options only', () => {
    expect(() => validateConventions({ 'demo.indentation': '4' }, [indentation])).not.toThrow();
    expect(() => validateConventions({ 'demo.tabs': '4' }, [indentation])).toThrow(
      /unknown convention "demo.tabs"\. Allowed conventions: demo.indentation/,
    );
    expect(() => validateConventions({ 'demo.indentation': 3 }, [indentation])).toThrow(
      /"conventions.demo.indentation" must be one of: "2", "4"/,
    );
    expect(() => validateConventions([], [indentation])).toThrow(/must be an object/);
  });

  it('describes where each choice came from', () => {
    const lines = describeConventions(
      {
        ...detect({ 'a.demo': '{\n    x\n}', 'b.demo': '{\n    x\n}', 'c.demo': '{\n  x\n}' }),
      },
      [indentation],
    );

    expect(lines).toEqual(['Demo indentation: 4 spaces (used by 2 of 3 measured files)']);
    expect(
      describeConventions({ 'demo.indentation': { choice: '4', source: 'pinned', counts: {} } }, [
        indentation,
      ]),
    ).toEqual(['Demo indentation: 4 spaces (set in nitpicker.config.json)']);
    expect(describeConventions(detect({}), [indentation])).toEqual([
      'Demo indentation: 2 spaces (preset default; no files to measure)',
    ]);
  });
});
