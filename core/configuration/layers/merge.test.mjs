import { describe, expect, it } from 'vitest';
import { mergeLayers, mergeSettings, settingsOf } from './merge.mjs';

describe('settingsOf', () => {
  it('drops the keys that only apply to the file that sets them', () => {
    expect(settingsOf({ extends: '../a.json', projects: ['web'], preset: 'java' })).toEqual({
      preset: 'java',
    });
  });
});

describe('mergeSettings', () => {
  it('lets a key the project sets replace the shared value', () => {
    expect(
      mergeSettings(
        { preset: 'typescript', exclude: ['a/**', 'b/**'], base: 'origin/main' },
        { preset: 'javascript', exclude: ['c/**'] },
      ),
    ).toEqual({ preset: 'javascript', exclude: ['c/**'], base: 'origin/main' });
  });

  it('merges settings that are objects by their own keys', () => {
    expect(
      mergeSettings(
        { thresholds: { crapLimit: 8, fileLines: 200 }, layout: { sourceRoots: ['lib'] } },
        { thresholds: { fileLines: 250 }, layout: { testRoots: ['spec'] } },
      ),
    ).toEqual({
      thresholds: { crapLimit: 8, fileLines: 250 },
      layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
    });
  });

  it('replaces the lists inside merged objects', () => {
    expect(
      mergeSettings({ python: { exceptions: [{ rule: 'a' }] } }, { python: { exceptions: [] } }),
    ).toEqual({ python: { exceptions: [] } });
  });

  it('does not change either input', () => {
    const shared = { thresholds: { crapLimit: 8 } };
    mergeSettings(shared, { thresholds: { fileLines: 100 } });
    expect(shared).toEqual({ thresholds: { crapLimit: 8 } });
  });
});

describe('mergeLayers', () => {
  it('applies the layers from the most shared to the project', () => {
    expect(
      mergeLayers([
        { base: 'origin/main', thresholds: { crapLimit: 8 }, extends: 'x.json' },
        { thresholds: { fileLines: 100 } },
        { base: 'origin/develop', projects: ['web'] },
      ]),
    ).toEqual({ base: 'origin/develop', thresholds: { crapLimit: 8, fileLines: 100 } });
  });

  it('gives an empty config for no layers', () => {
    expect(mergeLayers([])).toEqual({});
  });
});
