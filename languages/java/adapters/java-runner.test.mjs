import { describe, expect, it } from 'vitest';
import { parseRunnerArguments } from './java-runner.mjs';

describe('parseRunnerArguments', () => {
  it('rejects unknown options, missing values and a bad CRAP limit', () => {
    expect(() => parseRunnerArguments(['--project-root'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--project-root', '/p', '--nope', 'x'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--snapshot', 'head'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--project-root', '/p', '--crap-limit', '0'])).toThrow(
      /positive number/,
    );
  });

  it('leaves the preset to the caller and accepts the kotlin preset with a formatter', () => {
    expect(parseRunnerArguments(['--project-root', '/p']).policy).toEqual({
      crapLimit: undefined,
      exclude: [],
      exceptions: [],
      legacyInventory: undefined,
      policyRoot: undefined,
      baselineRoot: undefined,
      snapshot: 'head',
      preset: undefined,
      kotlinFormatter: undefined,
      kotlinDetektConfig: undefined,
    });
    expect(
      parseRunnerArguments([
        '--project-root',
        '/p',
        '--preset',
        'kotlin',
        '--kotlin-formatter',
        'none',
        '--kotlin-detekt-config',
        'detekt.yaml',
      ]).policy,
    ).toEqual({
      crapLimit: undefined,
      exclude: [],
      exceptions: [],
      legacyInventory: undefined,
      policyRoot: undefined,
      baselineRoot: undefined,
      snapshot: 'head',
      preset: 'kotlin',
      kotlinFormatter: 'none',
      kotlinDetektConfig: 'detekt.yaml',
    });
  });

  it.each(['nocolon', ':glob/**', 'rule:'])(
    'rejects the exception %s without a rule or a glob',
    (value) => {
      expect(() => parseRunnerArguments(['--project-root', '/p', '--exception', value])).toThrow(
        /Usage/,
      );
    },
  );

  it('keeps a colon inside the glob', () => {
    expect(
      parseRunnerArguments(['--project-root', '/p', '--exception', 'r:a:b/**']).policy.exceptions,
    ).toEqual([{ rule: 'r', glob: 'a:b/**' }]);
  });

  it('rejects an unknown preset or Kotlin formatter', () => {
    expect(() => parseRunnerArguments(['--project-root', '/p', '--preset', 'scala'])).toThrow(
      '--preset must be one of: java, kotlin',
    );
    expect(() =>
      parseRunnerArguments(['--project-root', '/p', '--kotlin-formatter', 'prettier']),
    ).toThrow('--kotlin-formatter must be one of: ktlint, ktfmt, none');
  });
});
