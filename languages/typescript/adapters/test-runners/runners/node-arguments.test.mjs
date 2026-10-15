import { describe, expect, it } from 'vitest';
import { nodeTestArguments, nodeTestArgumentsOf } from './node-arguments.mjs';

describe('node flags taken from a test script', () => {
  it.each([
    ['node --test', []],
    ['node --test test/', []],
    ['node --import tsx --test test/', ['--import', 'tsx']],
    ['node --test --import tsx test/', ['--import', 'tsx']],
    ['tsx --test', ['--import', 'tsx']],
    [
      'NODE_ENV=test node --experimental-strip-types --test --test-reporter=spec',
      ['--experimental-strip-types'],
    ],
    ['npm run build && node --require ./setup.cjs --test', ['--require', './setup.cjs']],
    ['node --env-file=.env --watch --test', ['--env-file=.env']],
    ['node --experimental-test-coverage --test', []],
    ['jest --ci', undefined],
    ['vitest run', undefined],
  ])('reads %j', (command, flags) => {
    expect(nodeTestArguments(command)).toEqual(flags);
  });

  it('takes the flags of the first test script that runs node --test', () => {
    const scripts = [
      ['test', 'eslint .'],
      ['test:unit', 'node --import tsx --test test/'],
      ['test:slow', 'node --require ./slow.cjs --test'],
    ];

    expect(nodeTestArgumentsOf(scripts)).toEqual(['--import', 'tsx']);
  });

  it('takes no flags when no script runs node --test', () => {
    expect(nodeTestArgumentsOf([['test', 'jest']])).toEqual([]);
  });
});
