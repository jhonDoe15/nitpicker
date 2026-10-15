import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRunData, metaFiles } from './python-mutation-data.mjs';

const roots = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-mutation-data-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const meta = (exitCodes) => JSON.stringify({ exit_code_by_key: exitCodes, durations_by_key: {} });

describe('mutmut run data', () => {
  it('lists the source files mutmut kept results for', () => {
    const root = project({
      'mutants/src/a.py.meta': meta({}),
      'mutants/src/pkg/b.py.meta': meta({}),
      'mutants/src/a.py': '',
      'mutants/mutmut-stats.json': '{}',
    });

    expect(metaFiles(path.join(root, 'mutants')).sort()).toEqual(['src/a.py', 'src/pkg/b.py']);
  });

  it('reads the exit codes, the generated code and the original source of each file', () => {
    const root = project({
      'mutants/src/a.py.meta': meta({ 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': null }),
      'mutants/src/a.py': 'generated',
      'src/a.py': 'original',
    });

    expect(collectRunData({ projectRoot: root })).toEqual({
      files: [
        {
          path: 'src/a.py',
          exitCodes: { 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': null },
          mutated: 'generated',
          original: 'original',
        },
      ],
    });
  });

  it('gives the results that were never checked the exit code it is told to', () => {
    const root = project({
      'mutants/src/a.py.meta': meta({ 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': null }),
      'mutants/src/a.py': 'generated',
    });

    const [file] = collectRunData({ projectRoot: root, uncheckedExitCode: 33 }).files;

    expect(file.exitCodes).toEqual({ 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': 33 });
    expect(file.original).toBeUndefined();
  });

  it('fails when mutmut left no mutants directory', () => {
    expect(() => collectRunData({ projectRoot: project({}) })).toThrow(
      'mutmut finished without writing a mutants directory',
    );
  });

  it.each([['{}'], ['{"exit_code_by_key": null}'], ['{"exit_code_by_key": 1}'], ['null']])(
    'says which mutmut versions are supported when %s has no exit codes',
    (text) => {
      const root = project({ 'mutants/src/a.py.meta': text, 'mutants/src/a.py': '' });

      expect(() => collectRunData({ projectRoot: root })).toThrow(
        'mutmut wrote src/a.py.meta without exit_code_by_key: this mutmut version is not supported (nitpicker reads the run data of mutmut 3.x)',
      );
    },
  );
});
