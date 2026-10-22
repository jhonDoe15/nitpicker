import { describe, expect, it } from 'vitest';
import { applyDisable, describeDisableCascade } from './config.mjs';

describe('disable', () => {
  it('turns off the analyzers that depend on a disabled one', () => {
    const analyzers = [{ name: 'coverage' }, { name: 'crap', dependencies: ['coverage'] }];

    expect(applyDisable(analyzers, { disable: ['coverage'] })).toEqual([]);
    expect(applyDisable(analyzers, { disable: ['coverage', 'crap'] })).toEqual([]);
    expect(applyDisable(analyzers, { disable: ['crap'] })).toEqual([{ name: 'coverage' }]);
  });

  it('turns off dependents through a chain, whatever the order of the analyzers', () => {
    const analyzers = [
      { name: 'report', dependencies: ['summary'] },
      { name: 'summary', dependencies: ['coverage'] },
      { name: 'coverage' },
      { name: 'lint' },
    ];

    expect(applyDisable(analyzers, { disable: ['coverage'] }).map(({ name }) => name)).toEqual([
      'lint',
    ]);
    expect(applyDisable(analyzers, { disable: ['summary'] }).map(({ name }) => name)).toEqual([
      'coverage',
      'lint',
    ]);
  });

  it('does not change the analyzers it is given', () => {
    const analyzers = [{ name: 'coverage' }, { name: 'crap', dependencies: ['coverage'] }];

    applyDisable(analyzers, { disable: ['coverage'] });

    expect(analyzers.map(({ name }) => name)).toEqual(['coverage', 'crap']);
  });

  it('describes what a disabled analyzer takes down with it', () => {
    const analyzers = [
      { name: 'coverage' },
      { name: 'crap', dependencies: ['coverage'] },
      { name: 'summary', dependencies: ['coverage'] },
      { name: 'report', dependencies: ['summary'] },
      { name: 'lint' },
      { name: 'dupes' },
      { name: 'clones', dependencies: ['dupes'] },
    ];

    expect(describeDisableCascade(analyzers, { disable: ['coverage', 'crap'] })).toEqual([
      'coverage is disabled, so summary and report are off too',
    ]);
    expect(describeDisableCascade(analyzers, { disable: ['dupes', 'coverage'] })).toEqual([
      'dupes is disabled, so clones is off too',
      'coverage is disabled, so crap, summary and report are off too',
    ]);
    expect(describeDisableCascade(analyzers, { disable: ['lint'] })).toEqual([]);
    expect(describeDisableCascade(analyzers, {})).toEqual([]);
  });
});
