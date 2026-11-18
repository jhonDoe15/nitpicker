import { describe, expect, it } from 'vitest';
import { uninstrumentedFile, uninstrumentedNote, withoutMutatedFile } from './uninstrumented.mts';

const PLACEMENT_OUTPUT = [
  'mutation crashed with exit 1: ERROR Stryker an error occurred',
  '/work/h3/src/h3.ts: src/h3.ts:73:12 expressionMutantPlacer could not place mutants with type(s): ' +
    '"StringLiteral". Either remove this file from the list of files to be mutated, or exclude the mutator ' +
    '(using mutator.excludedMutations). Please report this issue at https://github.com/stryker-mutator/stryker-js/issues',
  '  71 | export const name = "h3";',
].join('\n');
const FAILURE = {
  file: 'src/h3.ts',
  line: '73',
  placer: 'expressionMutantPlacer',
  mutators: 'StringLiteral',
};

describe('a file Stryker cannot instrument', () => {
  it('reads the file, line, placer and mutators from the instrumenter error', () => {
    expect(uninstrumentedFile(PLACEMENT_OUTPUT)).toEqual(FAILURE);
    expect(uninstrumentedFile('Error: There were failed tests in the initial test run.')).toBe(
      undefined,
    );
    expect(uninstrumentedFile(PLACEMENT_OUTPUT.replace(' src/h3.ts:', ' ../h3.ts:'))).toBe(
      undefined,
    );
  });

  it('reruns mutation with the file excluded from the mutate patterns', () => {
    const config = { mutate: ['src/**/*.ts', '!src/**/*.test.ts'], reporters: ['json'] };

    expect(withoutMutatedFile(config, 'src/h3.ts')).toEqual({
      mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/h3.ts'],
      reporters: ['json'],
    });
    expect(withoutMutatedFile({ reporters: ['json'] }, 'src/h3.ts')).toBe(undefined);
  });

  it('escapes the glob characters of the excluded file and keeps a file whose name starts with dots', () => {
    expect(withoutMutatedFile({ mutate: ['app/**'] }, './app/[id]/page.tsx')).toEqual({
      mutate: ['app/**', String.raw`!app/\[id\]/page.tsx`],
    });
    expect(uninstrumentedFile(PLACEMENT_OUTPUT.replaceAll('src/h3.ts', '..h3.ts'))?.file).toBe(
      '..h3.ts',
    );
  });

  it('names the skipped file in a descriptive note', () => {
    expect(uninstrumentedNote('mutation', FAILURE)).toEqual({
      tool: 'mutation',
      rule: 'mutation-file-not-instrumented',
      path: 'src/h3.ts',
      identity: 'mutation-file-not-instrumented',
      message:
        "mutation could not instrument src/h3.ts (Stryker's expressionMutantPlacer could not place " +
        'StringLiteral mutants at line 73), so its mutants were not tested; the other files were mutated. ' +
        'The failure is a Stryker bug, not a problem in this code.',
      classification: 'descriptive',
    });
  });
});
