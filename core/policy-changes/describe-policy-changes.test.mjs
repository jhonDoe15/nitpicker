import { describe, expect, it } from 'vitest';
import { describePolicyChanges } from './describe-policy-changes.mjs';

const exception = { rule: 'nitpicker/no-comments', paths: ['src/legacy/**'], reason: 'Legacy' };

describe('describePolicyChanges', () => {
  it('lists nothing when the configs match', () => {
    const config = { exclude: ['a/**'], exceptions: [exception], thresholds: { crapLimit: 12 } };
    expect(describePolicyChanges(config, structuredClone(config))).toEqual([]);
    expect(describePolicyChanges({}, {})).toEqual([]);
  });

  it('lists added excludes, disabled analyzers and exceptions only', () => {
    expect(
      describePolicyChanges(
        { exclude: ['old/**', 'kept/**'], disable: ['mutation'] },
        {
          exclude: ['kept/**', 'src/vendor/**'],
          disable: ['mutation', 'crap', 'coverage'],
          exceptions: [exception],
        },
      ),
    ).toEqual([
      'exclude added: src/vendor/**',
      'analyzer disabled: crap',
      'analyzer disabled: coverage',
      'exception added: nitpicker/no-comments for src/legacy/** (Legacy)',
    ]);
  });

  it('lists a python exception like a top-level one', () => {
    expect(
      describePolicyChanges(
        { python: { exceptions: [] } },
        { python: { exceptions: [exception] } },
      ),
    ).toEqual(['exception added: nitpicker/no-comments for src/legacy/** (Legacy)']);
  });

  it('lists a threshold raised above the base or the default, not a lowered one', () => {
    expect(
      describePolicyChanges(
        { thresholds: { crapLimit: 12, fileLines: 400 } },
        { thresholds: { crapLimit: 20, fileLines: 300, folderFiles: 8, lineLength: 100 } },
      ),
    ).toEqual([
      'threshold crapLimit raised from 12 to 20',
      'threshold folderFiles raised from 6 to 8',
    ]);
  });

  it('lists a changed preset, base, layout, react and tool setting with both values', () => {
    expect(
      describePolicyChanges(
        {
          preset: 'typescript',
          base: 'origin/main',
          layout: { sourceRoots: ['src'], entryPoints: ['bin/*.mjs'] },
          react: { styling: 'css-modules' },
          tools: { prettier: { precedence: ['nitpicker'] } },
        },
        {
          preset: 'javascript',
          base: 'origin/develop',
          layout: { sourceRoots: ['lib'], entryPoints: ['bin/*.mjs'] },
          react: { enabled: false, styling: 'css-modules' },
          tools: { prettier: { precedence: ['project'] } },
          legacyInventory: 'legacy.json',
        },
      ),
    ).toEqual([
      'preset: "typescript" -> "javascript"',
      'base: "origin/main" -> "origin/develop"',
      'layout.sourceRoots: ["src"] -> ["lib"]',
      'tools.prettier.precedence: ["nitpicker"] -> ["project"]',
      'react.enabled: not set -> false',
      'legacyInventory: not set -> "legacy.json"',
    ]);
  });

  it('lists a custom analyzer that head removed', () => {
    expect(
      describePolicyChanges(
        {
          analyzers: [
            { name: 'a', command: 'x' },
            { name: 'b', command: 'y' },
          ],
        },
        { analyzers: [{ name: 'b', command: 'y' }] },
      ),
    ).toEqual(['analyzer removed: a']);
  });
});
