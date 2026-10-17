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
      files: 3,
    });
  });

  it('hands the path of the file to measure', () => {
    const byFolder = {
      ...indentation,
      measure: (_text, file) => (file.startsWith('tests/') ? '4' : '2'),
    };
    const result = detectConventions({
      definitions: [byFolder],
      source: sourceOf({ 'tests/a.demo': 'x', 'tests/b.demo': 'x', 'src/c.demo': 'x' }),
    });

    expect(result['demo.indentation'].counts).toEqual({ 2: 1, 4: 2 });
  });

  it('falls back to the preset default on a tie or with nothing to measure', () => {
    expect(detect({ 'a.demo': '{\n    x\n}', 'b.demo': '{\n  y\n}' })['demo.indentation']).toEqual({
      choice: '2',
      source: 'default',
      counts: { 2: 1, 4: 1 },
      files: 2,
    });
    expect(detect({ 'a.txt': '{\n    x\n}' })['demo.indentation']).toEqual({
      choice: '2',
      source: 'default',
      counts: { 2: 0, 4: 0 },
      files: 0,
    });
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
      files: 2,
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

describe('conventions that collect names', () => {
  const helpers = {
    id: 'demo.helpers',
    label: 'Demo helpers',
    kind: 'names',
    minFiles: 2,
    fallback: [],
    files: ['**/*.demo'],
    measure: (text) => text.split(' ').filter((word) => word.startsWith('check')),
  };
  const detectNames = (files, definition = helpers) =>
    detectConventions({ definitions: [definition], source: sourceOf(files) })[definition.id];

  it('keeps the names found in at least minFiles files, sorted', () => {
    expect(
      detectNames({
        'a.demo': 'checkB checkA checkA',
        'b.demo': 'checkB checkA other',
        'c.demo': 'checkC',
      }),
    ).toEqual({
      choice: ['checkA', 'checkB'],
      source: 'majority',
      counts: { checkA: 2, checkB: 2, checkC: 1 },
      files: 3,
    });
  });

  it('falls back to no names when none is common enough', () => {
    expect(detectNames({ 'a.demo': 'checkA', 'b.demo': 'checkB' })).toEqual({
      choice: [],
      source: 'default',
      counts: { checkA: 1, checkB: 1 },
      files: 2,
    });
  });

  it('lets the convention choose among the counted evidence and sample more files', () => {
    const proven = {
      ...helpers,
      sampleLimit: 3,
      choose: (counts) =>
        Object.keys(counts).filter((name) => counts[name] >= 2 && name === 'checkA'),
    };

    expect(
      detectNames(
        {
          'a.demo': 'checkA checkB',
          'b.demo': 'checkA checkB',
          'c.demo': 'checkA',
          'd.demo': 'checkA',
        },
        proven,
      ),
    ).toEqual({
      choice: ['checkA'],
      source: 'majority',
      counts: { checkA: 3, checkB: 2 },
      files: 3,
    });
  });

  it('is carried to the policy only when names were found, and described by its list', () => {
    const found = {
      'demo.helpers': { choice: ['checkA', 'checkB'], source: 'majority', counts: {}, files: 3 },
    };

    expect(conventionChoices(found, [helpers])).toEqual({ 'demo.helpers': ['checkA', 'checkB'] });
    expect(
      conventionChoices({ 'demo.helpers': { choice: [], source: 'default' } }, [helpers]),
    ).toEqual({});
    expect(describeConventions(found, [helpers])).toEqual([
      'Demo helpers: checkA, checkB (final call of at least 2 of 3 measured files)',
    ]);
    expect(
      describeConventions(
        { 'demo.helpers': { choice: ['checkA'], source: 'pinned', counts: {} } },
        [helpers],
      ),
    ).toEqual(['Demo helpers: checkA (set in nitpicker.config.json)']);
  });

  it('validates a pin as a list of names', () => {
    const validate = (pin) => () => {
      validateConventions({ 'demo.helpers': pin }, [helpers]);
    };
    const message = '"conventions.demo.helpers" must be a list of function names';

    expect(validate(['checkA', 'check_b'])).not.toThrow();
    expect(validate([])).not.toThrow();
    expect(validate(['a b'])).toThrow(message);
    expect(validate('checkA')).toThrow(message);
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
