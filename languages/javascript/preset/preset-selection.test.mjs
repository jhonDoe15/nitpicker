import { describe, expect, it } from 'vitest';
import { presetAnalyzers } from '../../../core/preset-analyzers.mjs';
import {
  applyLayout,
  applyThresholds,
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../../typescript/preset/diff/configured-analyzers.mjs';
import {
  readHeadPolicy,
  readLayout,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../../typescript/preset/head-policy.mjs';
import { resolveLayout, resolveLayoutFor } from '../../typescript/preset/layout.mjs';
import { createQualityChecks } from '../../typescript/preset/quality-checks.mjs';
import { isJavascriptPolicy } from './javascript-preset.mjs';

const packageRoot = new URL('../../..', import.meta.url).pathname;
const javascriptPolicy = resolveHeadPolicy({ preset: 'javascript' });

function analyzerNames(analyzers) {
  return analyzers.map(({ name }) => name);
}

function prettierPatterns(layout) {
  return createQualityChecks(layout).staticChecks.find(({ name }) => name === 'prettier-format')
    .patterns;
}

describe('preset selection', () => {
  it('runs the TypeScript analyzers for the typescript preset and for no preset', () => {
    expect(presetAnalyzers({ preset: 'typescript' })).toBe(configuredAnalyzers);
    expect(presetAnalyzers({})).toBe(configuredAnalyzers);
  });

  it('runs the JavaScript analyzer set for the javascript preset', () => {
    expect(presetAnalyzers({ preset: 'javascript' })).toBe(javascriptAnalyzers);
  });

  it('prefers injected analyzers over any preset', () => {
    const injected = [{ name: 'custom' }];
    expect(presetAnalyzers({ preset: 'javascript' }, injected)).toBe(injected);
  });

  it('runs the same checks as the TypeScript preset', () => {
    expect(analyzerNames(javascriptAnalyzers)).toEqual(analyzerNames(configuredAnalyzers));
    expect(javascriptAnalyzers).not.toBe(configuredAnalyzers);
  });

  it('recognises the javascript preset in a head policy only', () => {
    expect(isJavascriptPolicy({ preset: 'javascript' })).toBe(true);
    expect(isJavascriptPolicy({ preset: 'typescript' })).toBe(false);
    expect(isJavascriptPolicy({})).toBe(false);
    expect(isJavascriptPolicy(undefined)).toBe(false);
  });
});

describe('head policy preset', () => {
  it('carries the javascript preset to the runners', () => {
    expect(javascriptPolicy).toMatchObject({ preset: 'javascript' });
    withHeadPolicyFile(javascriptPolicy, (policyFile) => {
      const environment = { NITPICKER_POLICY: policyFile };
      expect(readHeadPolicy(environment).preset).toBe('javascript');
      expect(readLayout(environment)).toMatchObject({
        javascript: true,
        entryExtensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'],
      });
    });
  });

  it('leaves the head policy of other presets without a preset key', () => {
    for (const preset of ['typescript', 'java', undefined]) {
      expect(resolveHeadPolicy({ preset })).not.toHaveProperty('preset');
    }
    withHeadPolicyFile(resolveHeadPolicy({}), (policyFile) => {
      expect(readLayout({ NITPICKER_POLICY: policyFile })).toMatchObject({
        javascript: false,
        entryExtensions: ['ts'],
      });
    });
    expect(readLayout({})).toMatchObject({ javascript: false });
  });
});

describe('javascript layout', () => {
  it('lints every unit test under the source and test roots for JavaScript', () => {
    expect(resolveLayout({}, [], { javascript: true }).unitTestGlobs).toEqual([
      'src/**/__tests__/**/*.{ts,mts,cts,js,mjs,cjs}',
      'test/unit/**/*.{ts,mts,cts,js,mjs,cjs}',
      'tests/unit/**/*.{ts,mts,cts,js,mjs,cjs}',
    ]);
    expect(resolveLayout({}, []).unitTestGlobs).toEqual([
      'src/**/__tests__/**/*.ts',
      'test/unit/**/*.ts',
      'tests/unit/**/*.ts',
    ]);
  });

  it('reads .ts files as part of the project and leaves .jsx and .tsx files outside it', () => {
    const layout = resolveLayout({}, [], { javascript: true });
    expect(layout.sourceGlobs).toEqual(['src/**/*.{ts,mts,cts,js,mjs,cjs}']);
    for (const file of ['src/main/a.ts', 'src/main/a.mts', 'src/main/a.cjs', 'src/main/a.js']) {
      expect(layout.isSourceFile(file), file).toBe(true);
    }
    for (const file of ['src/main/a.jsx', 'src/main/a.tsx']) {
      expect(layout.isSourceFile(file), file).toBe(false);
    }
    expect(layout.isRunnableTestFile('test/a.test.jsx')).toBe(false);
    expect(layout.isRunnableTestFile('test/a.test.cts')).toBe(true);
    expect(resolveLayout().isSourceFile('src/main/a.jsx')).toBe(true);
  });

  it('resolves the layout of a policy', () => {
    expect(resolveLayoutFor(javascriptPolicy).javascript).toBe(true);
    expect(resolveLayoutFor(resolveHeadPolicy({})).javascript).toBe(false);
    expect(resolveLayoutFor().javascript).toBe(false);
    expect(
      resolveLayoutFor(
        resolveHeadPolicy({
          preset: 'javascript',
          layout: { sourceRoots: ['lib'] },
          exclude: ['x/**'],
        }),
      ),
    ).toMatchObject({ sourceRoots: ['lib'], exclude: ['x/**'], javascript: true });
  });

  it('keeps the default layout flags off', () => {
    const layout = resolveLayout();
    expect(layout.javascript).toBe(false);
    expect(layout.entryExtensions).toEqual(['ts']);
  });
});

describe('javascript prettier patterns', () => {
  it('check the JavaScript and TypeScript extensions of a JavaScript project', () => {
    expect(prettierPatterns(resolveLayout({}, [], { javascript: true }))).toEqual([
      'src/**/*.{ts,mts,cts,js,mjs,cjs,json,yaml,yml}',
      'test/**/*.{ts,mts,cts,js,mjs,cjs,json}',
      'tests/**/*.{ts,mts,cts,js,mjs,cjs,json}',
      '*.{ts,mts,cts,js,mjs,cjs,json}',
    ]);
    expect(prettierPatterns(resolveLayout())).toEqual([
      'src/**/*.{ts,mts,mjs,json,yaml,yml}',
      'test/**/*.{ts,mts,mjs,json}',
      'tests/**/*.{ts,mts,mjs,json}',
      '*.{ts,mts,mjs,json}',
    ]);
  });

  it('watch the javascript preset file in the policy hash of every check it shapes', () => {
    const { staticChecks, qualityAreaChecks } = createQualityChecks();
    const shaped = [
      ...staticChecks.filter(({ name }) =>
        ['typescript-typecheck', 'prettier-format'].includes(name),
      ),
      ...qualityAreaChecks.filter(({ name }) =>
        ['duplicates', 'dead-code', 'coverage', 'crap', 'mutation'].includes(name),
      ),
    ];
    expect(shaped.map(({ name }) => name).sort()).toEqual([
      'coverage',
      'crap',
      'dead-code',
      'duplicates',
      'mutation',
      'prettier-format',
      'typescript-typecheck',
    ]);
    for (const check of shaped) {
      expect(check.configurationFiles, check.name).toContain(
        'languages/javascript/preset/javascript-preset.mjs',
      );
    }
  });
});

describe('javascript analyzers with a customized policy', () => {
  const customized = resolveHeadPolicy({ preset: 'javascript', layout: { sourceRoots: ['lib'] } });

  function invocation(analyzers, name) {
    return analyzers
      .find((analyzer) => analyzer.name === name)
      .createInvocation({ projectRoot: '/p', policyRoot: '/p', toolRoot: packageRoot });
  }

  it('rebuild with the project roots and keep the JavaScript pipeline', () => {
    const rebuilt = applyLayout(javascriptAnalyzers, customized);
    expect(rebuilt).not.toBe(javascriptAnalyzers);
    expect(analyzerNames(rebuilt)).toEqual(analyzerNames(javascriptAnalyzers));
    const underLib = (name) =>
      invocation(rebuilt, name).args.filter((argument) => argument.startsWith('lib/'));
    expect(underLib('eslint-lint')).toEqual([
      'lib/**/*.{ts,mts,cts,js,mjs,cjs}',
      'lib/**/*.{test,spec}.{ts,mts,cts,js,mjs,cjs}',
    ]);
    expect(underLib('prettier-format')).toEqual(['lib/**/*.{ts,mts,cts,js,mjs,cjs,json,yaml,yml}']);
  });

  it('keep the shared analyzer set when only the preset is chosen', () => {
    expect(applyLayout(javascriptAnalyzers, javascriptPolicy)).toBe(javascriptAnalyzers);
  });

  it('rebuild the shared analyzers of either preset and replace nothing else', () => {
    const custom = { name: 'custom', createInvocation() {} };
    expect(applyLayout([custom], customized)).toEqual([custom]);
    const rebuiltTypescript = applyLayout(configuredAnalyzers, customized);
    expect(analyzerNames(rebuiltTypescript)).toEqual(analyzerNames(configuredAnalyzers));
  });

  it('apply the crap limit with the javascript layout', () => {
    const limited = applyThresholds(javascriptAnalyzers, { crapLimit: 7 }, customized);
    const crap = limited.find(({ name }) => name === 'crap');
    expect(crap).not.toBe(javascriptAnalyzers.find(({ name }) => name === 'crap'));
    expect(applyThresholds(javascriptAnalyzers, {}, customized)).toBe(javascriptAnalyzers);
  });
});
