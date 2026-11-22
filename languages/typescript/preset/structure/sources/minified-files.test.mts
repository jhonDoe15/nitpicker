import { describe, expect, it } from 'vitest';
import { useProjectFixtures } from '../../../../../core/diff/git/test-support/projects/project-fixtures.mts';
import { resolveLayout } from '../../layout.mts';
import type { StructurePolicy } from '../typed/structure-types.mts';
import { isMinifiedSourceText, minifiedSourceFindings } from './minified-files.mts';

const { outsideGit } = useProjectFixtures();

const MINIFIED_UNIT =
  'function f(a,b){var c=a&&b||0;if(c===1){return new Map([[a,b]]);}for(let i=0;i<c;i++){a=a+i;}return typeof a!=="undefined"?a:void 0;}';

function minifiedBundle(repeat = 90): string {
  return Array.from({ length: repeat }, (_, index) =>
    MINIFIED_UNIT.replace('function f(', `function f${index}(`),
  ).join('');
}

function wrappedMinifiedBundle(): string {
  return Array.from({ length: 18 }, (_, index) =>
    Array.from({ length: 6 }, (__, inner) =>
      MINIFIED_UNIT.replace('function f(', `function w${index}_${inner}(`),
    ).join(''),
  ).join('\n');
}

function normalFormattedSource(): string {
  return Array.from(
    { length: 220 },
    (_, index) =>
      `export function compute${index}(value: number): number {\n` +
      `  const doubled = value * 2;\n` +
      `  return doubled + ${index};\n` +
      `}\n`,
  ).join('\n');
}

function jsonLikeDataTable(): string {
  const entries = Array.from(
    { length: 400 },
    (_, index) =>
      `{"id":${index},"code":"ITEM_${index}","label":"Record number ${index}","active":true}`,
  ).join(',');
  return `export default [${entries}];\n`;
}

function numericDataTable(): string {
  const numbers = Array.from({ length: 3000 }, (_, index) => String(index)).join(',');
  return `export const LOOKUP_TABLE = [${numbers}];\n`;
}

function base64StringBlob(): string {
  return `export const ICON_BLOB = "${'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='.repeat(400)}";\n`;
}

function findingsOf(
  files: Readonly<Record<string, string>>,
  policy: Partial<StructurePolicy> = {},
  layout = resolveLayout(),
) {
  return minifiedSourceFindings({
    projectRoot: outsideGit(files),
    analyzerName: 'structure',
    layout,
    policy: { exceptions: [], thresholds: {}, ...policy },
  });
}

describe('isMinifiedSourceText', () => {
  it('detects single-line, wrapped, and header-prefixed minified bundles', () => {
    const withHeader = [
      '/*',
      ' * Vendored library v1.0.0',
      ' * MIT License',
      ' */',
      minifiedBundle(85),
    ].join('\n');

    expect(isMinifiedSourceText(minifiedBundle())).toBe(true);
    expect(isMinifiedSourceText(wrappedMinifiedBundle())).toBe(true);
    expect(isMinifiedSourceText(withHeader)).toBe(true);
  });

  it('ignores small one-liners, normal formatted source, data tables, and large string literals', () => {
    expect(isMinifiedSourceText(minifiedBundle(20))).toBe(false);
    expect(isMinifiedSourceText(normalFormattedSource())).toBe(false);
    expect(isMinifiedSourceText(jsonLikeDataTable())).toBe(false);
    expect(isMinifiedSourceText(numericDataTable())).toBe(false);
    expect(isMinifiedSourceText(base64StringBlob())).toBe(false);
  });
});

describe('minified-source-file', () => {
  it('flags minified JS and TS files in source roots and skips normal files, declarations, and non-source roots', () => {
    const bundle = minifiedBundle();
    const findings = findingsOf({
      'src/vendor/chart.js': bundle,
      'src/vendor/helper.mts': wrappedMinifiedBundle(),
      'src/vendor/types.d.ts': bundle,
      'src/app/normal.ts': normalFormattedSource(),
      'src/app/table.ts': jsonLikeDataTable(),
      'tests/fixtures/bundle.js': bundle,
      'src/orders/__tests__/__fixtures__/fixture.js': bundle,
      'scripts/compiled.mjs': bundle,
    });

    expect(findings.map(({ path: file, identity, rule }) => [file, identity, rule])).toEqual([
      ['src/vendor/chart.js', 'minified-source-file', 'minified-source-file'],
      ['src/vendor/helper.mts', 'minified-source-file', 'minified-source-file'],
    ]);
    expect(findings[0]?.message).toBe(
      'src/vendor/chart.js looks like a minified bundle inside a source root, which slows down analysis and hides unreviewed code. ' +
        'Move it out of the source root, load it as a dependency, or exclude it in the layout. ' +
        'If this is intended, add {"rule":"minified-source-file","paths":["src/vendor/chart.js"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    );
  });

  it('respects layout exclusions and policy exceptions', () => {
    const files = {
      'src/vendor/chart.js': minifiedBundle(),
      'src/legacy/bundle.ts': minifiedBundle(),
    };
    const excludedLayout = resolveLayout({}, ['src/vendor/**']);
    const exception = {
      rule: 'minified-source-file',
      paths: ['src/legacy/**'],
      reason: 'legacy vendor bundle',
    };

    expect(findingsOf(files, {}, excludedLayout).map(({ path: file }) => file)).toEqual([
      'src/legacy/bundle.ts',
    ]);
    expect(findingsOf(files, { exceptions: [exception] }).map(({ path: file }) => file)).toEqual([
      'src/vendor/chart.js',
    ]);
  });
});
