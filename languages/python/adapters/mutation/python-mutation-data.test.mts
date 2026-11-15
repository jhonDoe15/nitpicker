import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JSON_NULL } from '../analysis/typed/json-null.mts';
import type { JsonNull } from '../analysis/typed/python-graph-types.mts';
import {
  collectRunData as untypedCollect,
  metaFiles as untypedMetaFiles,
  MUTANTS_DIRECTORY,
  NO_COVERAGE_EXIT_CODE,
} from './python-mutation-data.mjs';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';

const { temporaryRoot } = useGitFixtures();

type RunFile = {
  readonly path: string;
  readonly exitCodes: Readonly<Record<string, number | JsonNull>>;
  readonly mutated: string;
  readonly original?: string | undefined;
};

const metaFiles: (directory: string) => string[] = untypedMetaFiles;
const readRunData: (request: { projectRoot: string; uncheckedExitCode: number | undefined }) => {
  files: RunFile[];
} = untypedCollect;

function collectRunData({
  projectRoot,
  uncheckedExitCode,
}: {
  readonly projectRoot: string;
  readonly uncheckedExitCode?: number;
}): { files: RunFile[] } {
  return readRunData({ projectRoot, uncheckedExitCode });
}

function project(files: Readonly<Record<string, string>>) {
  const root = temporaryRoot('nitpicker-python-mutation-data-');
  writeFiles(root, files);
  return root;
}

const meta = (exitCodes: Readonly<Record<string, number | JsonNull>>): string =>
  JSON.stringify({ exit_code_by_key: exitCodes, durations_by_key: {} });

describe('mutmut run data', () => {
  it('lists the source files mutmut kept results for', () => {
    const root = project({
      'mutants/src/a.py.meta': meta({}),
      'mutants/src/pkg/b.py.meta': meta({}),
      'mutants/src/a.py': '',
      'mutants/mutmut-stats.json': '{}',
    });

    expect(
      metaFiles(path.join(root, MUTANTS_DIRECTORY)).sort((left, right) =>
        left.localeCompare(right),
      ),
    ).toEqual(['src/a.py', 'src/pkg/b.py']);
  });

  it('reads the exit codes, the generated code and the original source of each file', () => {
    const root = project({
      'mutants/src/a.py.meta': meta({ 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': JSON_NULL }),
      'mutants/src/a.py': 'generated',
      'src/a.py': 'original',
    });

    expect(collectRunData({ projectRoot: root })).toEqual({
      files: [
        {
          path: 'src/a.py',
          exitCodes: { 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': JSON_NULL },
          mutated: 'generated',
          original: 'original',
        },
      ],
    });
  });

  it('gives the results that were never checked the exit code it is told to', () => {
    const root = project({
      'mutants/src/a.py.meta': meta({ 'a.x_f__mutmut_1': 0, 'a.x_f__mutmut_2': JSON_NULL }),
      'mutants/src/a.py': 'generated',
    });

    const [file] = collectRunData({
      projectRoot: root,
      uncheckedExitCode: NO_COVERAGE_EXIT_CODE,
    }).files;

    expect(file?.exitCodes).toEqual({
      'a.x_f__mutmut_1': 0,
      'a.x_f__mutmut_2': NO_COVERAGE_EXIT_CODE,
    });
    expect(file?.original).toBeUndefined();
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
