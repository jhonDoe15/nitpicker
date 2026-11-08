import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/configuration/validate.mjs';

const go = (extra) => () => validateConfig({ preset: 'go', ...extra });

describe('the go preset config', () => {
  it('accepts its settings, shared thresholds, tool precedence and <tool>/<rule> exceptions', () => {
    expect(
      go({
        go: { formatters: ['gofumpt', 'goimports'], buildTags: ['integration'] },
        thresholds: { folderDepth: 5, classMethods: 30, lineLength: 100 },
        tools: { goimports: { precedence: ['project', 'nitpicker'] } },
        exceptions: [
          { rule: 'vet/printf', paths: ['internal/log/*.go'], reason: 'custom printf wrapper' },
          {
            rule: 'function-lines-limit',
            paths: ['cmd/main.go'],
            function: 'main',
            reason: 'wiring',
          },
          { rule: 'class-fields-limit', paths: ['config/*.go'], reason: 'flat config struct' },
        ],
      }),
    ).not.toThrow();
  });

  it('accepts the feature layout, duplicate scan settings and the rules of the dead-code checks', () => {
    expect(
      go({
        layout: { featureRoots: ['internal/features'], sharedRoots: ['internal/platform'] },
        duplicates: { skippedFolders: ['testdata', 'vendor', 'mocks'] },
        tools: { jscpd: { precedence: ['project'] } },
        exceptions: [
          { rule: 'deadcode/unreachable-func', paths: ['internal/debug/*.go'], reason: 'manual' },
          { rule: 'duplicate-clone', paths: ['internal/legacy/*.go'], reason: 'frozen' },
          { rule: 'stability-direction', paths: ['internal/app/doc.go'], reason: 'composition' },
          { rule: 'test-only-export', paths: ['internal/fake/*.go'], reason: 'fixtures' },
          { rule: 'unused-dependency', paths: ['go.mod'], reason: 'loaded by plugin' },
        ],
      }),
    ).not.toThrow();
  });

  it.each([
    [{ go: { formatter: 'gofmt' } }, 'unknown key "formatter" in "go"'],
    [
      { go: { formatters: ['golines'] } },
      '"go.formatters" must list one or more of: gofmt, gofumpt, goimports',
    ],
    [{ go: { formatters: [] } }, '"go.formatters" must list one or more of'],
    [{ go: { buildTags: ['a b'] } }, '"go.buildTags" entries must be build tag names'],
    [{ thresholds: { inheritanceDepth: 2 } }, 'Go has no inheritance'],
    [{ react: { enabled: true } }, '"react" is not supported with "preset": "go"'],
    [
      { layout: { sourceRoots: ['src'] } },
      '"layout.sourceRoots" is not supported with "preset": "go"',
    ],
    [{ tools: { prettier: { precedence: ['project'] } } }, 'unknown tool "prettier"'],
    [
      { exceptions: [{ rule: 'staticcheck/SA1019', paths: ['a.go'], reason: 'not run yet' }] },
      'must name a finding as it is printed, "<tool>/<rule>" (for example "vet/printf")',
    ],
  ])('rejects %j', (extra, message) => {
    expect(go(extra)).toThrow(message);
  });

  it('rejects the go key with another preset', () => {
    expect(() => validateConfig({ preset: 'python', go: {} })).toThrow(
      '"go" is only supported with "preset": "go"',
    );
  });
});
