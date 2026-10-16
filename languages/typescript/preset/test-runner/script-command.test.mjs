import { describe, expect, it } from 'vitest';
import { runnerCommand, tokenize, withoutOptions } from './script-command.mjs';

describe('test script commands', () => {
  it('splits a command into words and separators and drops quotes', () => {
    expect(tokenize(`a "b c" 'd'&&e;f|g`)).toEqual([
      'a',
      'b c',
      'd',
      { separator: '&&' },
      'e',
      { separator: ';' },
      'f',
      { separator: '|' },
      'g',
    ]);
  });

  it('takes the environment, node options and runner arguments of the runner segment', () => {
    expect(
      runnerCommand(
        'tsc && cross-env NODE_ENV=test node --experimental-vm-modules node_modules/jest/bin/jest.js -c j.json',
        'jest',
      ),
    ).toEqual({
      environment: { NODE_ENV: 'test' },
      nodeArguments: ['--experimental-vm-modules'],
      arguments_: ['-c', 'j.json'],
    });
  });

  it('takes the node options before --test and the arguments after it', () => {
    expect(runnerCommand('c8 node --import tsx --test "test/**/*.ts"', 'node')).toEqual({
      environment: {},
      nodeArguments: ['--import', 'tsx'],
      arguments_: ['test/**/*.ts'],
    });
  });

  it('reads tsx --test as node:test with the tsx loader', () => {
    expect(runnerCommand('tsx --test test/', 'node')).toEqual({
      environment: {},
      nodeArguments: ['--import', 'tsx'],
      arguments_: ['test/'],
    });
  });

  it('finds no command when the script does not run the runner', () => {
    expect(runnerCommand('vitest run', 'jest')).toBeUndefined();
    expect(runnerCommand('node build.js', 'node')).toBeUndefined();
    expect(runnerCommand(undefined, 'jest')).toBeUndefined();
  });

  it('drops options nitpicker sets itself, in either spelling, with their values', () => {
    expect(
      withoutOptions(
        [
          '--watch',
          '--output-file',
          'a.json',
          '--outputFile=b.json',
          '--runInBand',
          'src',
          '-R',
          'dot',
          '-r',
          'setup.js',
        ],
        { flags: ['--watch'], valued: ['--outputFile', '-R'] },
      ),
    ).toEqual(['--runInBand', 'src', '-r', 'setup.js']);
  });
});
