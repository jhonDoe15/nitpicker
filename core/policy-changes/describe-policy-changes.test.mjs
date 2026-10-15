import { describe, expect, it } from 'vitest';
import { describePolicyChanges, policyChangeFields } from './describe-policy-changes.mjs';

const exception = { rule: 'nitpicker/no-comments', paths: ['src/legacy/**'], reason: 'Legacy' };

function loosened(baseConfig, headConfig) {
  return describePolicyChanges(baseConfig, headConfig).loosened;
}

describe('describePolicyChanges', () => {
  it('lists nothing when the configs match', () => {
    const config = { exclude: ['a/**'], exceptions: [exception], thresholds: { crapLimit: 12 } };
    const none = { loosened: [], changed: [] };

    expect(describePolicyChanges(config, structuredClone(config))).toEqual(none);
    expect(describePolicyChanges({}, {})).toEqual(none);
  });

  it('counts added excludes, disabled analyzers and exceptions as loosening', () => {
    expect(
      loosened(
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

  it('counts only the paths an exception gains, and not a narrowed or reworded one', () => {
    const widened = { ...exception, paths: ['src/legacy/**', 'src/new/**'] };
    const narrowed = { ...exception, paths: [] };
    const reworded = { ...exception, reason: 'Still legacy' };

    expect(loosened({ exceptions: [exception] }, { exceptions: [widened] })).toEqual([
      'exception added: nitpicker/no-comments for src/new/** (Legacy)',
    ]);
    expect(loosened({ exceptions: [exception] }, { exceptions: [narrowed] })).toEqual([]);
    expect(loosened({ exceptions: [exception] }, { exceptions: [reworded] })).toEqual([]);
  });

  it('counts a python exception like a top-level one', () => {
    expect(
      loosened({ python: { exceptions: [] } }, { python: { exceptions: [exception] } }),
    ).toEqual(['exception added: nitpicker/no-comments for src/legacy/** (Legacy)']);
  });

  it('counts a threshold raised above the base or the default, not a lowered one', () => {
    expect(
      loosened(
        { thresholds: { crapLimit: 12, fileLines: 400 } },
        { thresholds: { crapLimit: 20, fileLines: 300, folderFiles: 8, lineLength: 100 } },
      ),
    ).toEqual([
      'threshold crapLimit raised from 12 to 20',
      'threshold folderFiles raised from 6 to 8',
    ]);
  });

  it('counts a removed custom analyzer', () => {
    expect(
      loosened(
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

  it('counts added layout exclusions and entry points, and lists a root change without counting it', () => {
    expect(
      describePolicyChanges(
        { layout: { sourceRoots: ['src', 'lib'], entryPoints: ['bin/*.mjs'] } },
        {
          layout: {
            sourceRoots: ['src', 'app'],
            excludedGlobs: ['dist/**', '**/vendor/**'],
            entryPoints: ['bin/*.mjs', 'scripts/*.mjs'],
          },
        },
      ),
    ).toEqual({
      loosened: [
        'layout.excludedGlobs added: **/vendor/**',
        'layout.entryPoints added: scripts/*.mjs',
      ],
      changed: ['layout.sourceRoots: ["src","lib"] -> ["src","app"]'],
    });
  });

  it('counts a changed preset, react.enabled and tool precedence as loosening, other settings not', () => {
    expect(
      describePolicyChanges(
        {
          preset: 'typescript',
          base: 'origin/main',
          react: { styling: 'css-modules' },
          tools: { prettier: { precedence: ['nitpicker'] } },
        },
        {
          preset: 'javascript',
          base: 'origin/develop',
          react: { enabled: false, styling: 'css-modules' },
          tools: { prettier: { precedence: ['project'] } },
          legacyInventory: 'legacy.json',
        },
      ),
    ).toEqual({
      loosened: [
        'preset: "typescript" -> "javascript"',
        'tools.prettier.precedence: ["nitpicker"] -> ["project"]',
        'react.enabled: not set -> false',
      ],
      changed: [
        'base: "origin/main" -> "origin/develop"',
        'legacyInventory: not set -> "legacy.json"',
      ],
    });
  });

  it('lists the loosening changes first in the summary fields', () => {
    expect(policyChangeFields({ base: 'a' }, { base: 'b', exclude: ['x/**'] })).toEqual({
      policyChanges: ['exclude added: x/**', 'base: "a" -> "b"'],
      policyLoosenings: ['exclude added: x/**'],
    });
  });
});
