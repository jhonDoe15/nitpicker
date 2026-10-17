import { describe, expect, it } from 'vitest';
import { parseTestCommand, runnerCommand, tokenize, withoutOptions } from './script-command.mjs';

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
      precedingCommands: ['tsc'],
    });
  });

  it('takes the node options before --test and the arguments after it', () => {
    expect(runnerCommand('c8 node --import tsx --test "test/**/*.ts"', 'node')).toEqual({
      environment: {},
      nodeArguments: ['--import', 'tsx'],
      arguments_: ['test/**/*.ts'],
      precedingCommands: [],
    });
  });

  it('reads tsx --test as node:test with the tsx loader', () => {
    expect(runnerCommand('tsx --test test/', 'node')).toEqual({
      environment: {},
      nodeArguments: ['--import', 'tsx'],
      arguments_: ['test/'],
      precedingCommands: [],
    });
  });

  it('keeps the values of node options written before the runner binary', () => {
    expect(
      runnerCommand(
        'c8 node -r ./env.cjs --max-old-space-size 4096 node_modules/.bin/jest --ci',
        'jest',
      ),
    ).toEqual({
      environment: {},
      nodeArguments: ['-r', './env.cjs', '--max-old-space-size', '4096'],
      arguments_: ['--ci'],
      precedingCommands: [],
    });
  });

  it('drops the node:test options nitpicker sets itself on either side of --test', () => {
    expect(
      runnerCommand(
        'node --watch --test-reporter=spec --test-concurrency 2 --experimental-test-coverage --import tsx ' +
          '--test --test-reporter spec --watch-path=src test/',
        'node',
      ),
    ).toEqual({
      environment: {},
      nodeArguments: ['--import', 'tsx'],
      arguments_: ['test/'],
      precedingCommands: [],
    });
  });

  it('runs ts-mocha as Mocha with the ts-mocha hook and its tsconfig', () => {
    expect(
      runnerCommand('ts-mocha -p tsconfig.test.json --paths --type-check "test/**/*.ts"', 'mocha'),
    ).toEqual({
      environment: {
        TS_NODE_PROJECT: 'tsconfig.test.json',
        TS_CONFIG_PATHS: 'true',
        TS_TYPE_CHECK: 'true',
      },
      nodeArguments: [],
      arguments_: ['--require', 'ts-mocha', 'test/**/*.ts'],
      precedingCommands: [],
    });
  });

  it.each([
    [
      'react-scripts test --watchAll=false --env=jsdom',
      'react-scripts',
      ['--watchAll=false', '--env=jsdom'],
    ],
    ['craco test', 'craco', []],
    ['react-app-rewired test --env=jsdom', 'react-app-rewired', ['--env=jsdom']],
    ['rescripts test', 'rescripts', []],
  ])('reads %j as Jest started by its launcher', (command, launcher, tokens) => {
    expect(runnerCommand(command, 'jest')).toEqual({
      environment: {},
      nodeArguments: [],
      arguments_: tokens,
      launcher,
      precedingCommands: [],
    });
  });

  it('records the steps the script runs before the test command', () => {
    expect(
      runnerCommand(`tsc -p tsconfig.test.json && echo 'built' ; node --test dist/`, 'node'),
    ).toEqual({
      environment: {},
      nodeArguments: [],
      arguments_: ['dist/'],
      precedingCommands: ['tsc -p tsconfig.test.json', "echo 'built'"],
    });
    expect(runnerCommand('npm run build && jest', 'jest')).toEqual({
      environment: {},
      nodeArguments: [],
      arguments_: [],
      precedingCommands: ['npm run build'],
    });
  });

  it.each([
    ['node --experimental-vm-modules node_modules/jest/bin/jest.js', 'jest'],
    ['node ./node_modules/.bin/_mocha', 'mocha'],
    ['node --test test/jest', 'node'],
    ['nyc --reporter=lcov mocha', 'mocha'],
    ['jest.cmd', 'jest'],
  ])('finds the runner of %j by the first runner binary it starts', (command, runner) => {
    expect(parseTestCommand(command)?.runner).toBe(runner);
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
