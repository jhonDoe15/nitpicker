import { ESLint } from 'eslint';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { usePresetConfig } from '../../../typescript/preset/test-support/preset-config-import.mts';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import { lintFixture } from '../../../typescript/preset/eslint-config/typed/lint-fixture.mts';
import { reactSyntaxConfigFor } from '../../../typescript/preset/eslint-config/react/react-scope.mts';
import { isReactProject } from '../../../typescript/preset/eslint-config/scope-support.mts';
import { resolveLayout } from '../../../typescript/preset/layout.mts';
const fixtureRoot = path.join(import.meta.dirname, '../fixtures/react-project');
const layout = resolveLayout({}, [], { javascript: true });
const { linterConfigFor } = usePresetConfig('javascript-react');
const config = [
  { languageOptions: { parser: tseslint.parser } },
  ...(await reactSyntaxConfigFor(layout, { styling: 'class-names' })),
];

function ruleIdsOf(directory: string): Record<string, string[]> {
  const folder = path.join(fixtureRoot, directory);
  return Object.fromEntries(
    readdirSync(folder)
      .toSorted()
      .map((name) => [
        name.replace(/\.jsx$/u, ''),
        [
          ...new Set(
            lintFixture({
              config,
              filename: `${directory}/${name}`,
              code: readFileSync(path.join(folder, name), 'utf8'),
            }).map(({ ruleId }) => ruleId ?? 'parse-error'),
          ),
        ].toSorted(),
      ]),
  );
}

describe('the React scope in a JavaScript project', () => {
  it('is on for a project that depends on react', () => {
    expect(isReactProject({ projectRoot: fixtureRoot })).toBe(true);
    expect(layout.isSourceFile('src/main/ui/allowed.jsx')).toBe(true);
    expect(layout.isTestFile('test/ui/allowed.test.jsx')).toBe(true);
  });

  it('flags hooks, accessibility and nitpicker React rules in .jsx files and passes the allowed one', () => {
    expect(ruleIdsOf('src/main/ui')).toEqual({
      allowed: [],
      'conditional-hook': ['react-hooks/rules-of-hooks'],
      'derived-state': ['nitpicker/react-no-effect-derived-state'],
      'effect-fetch': ['nitpicker/react-no-effect-data-fetching'],
      inaccessible: [
        'jsx-a11y/alt-text',
        'jsx-a11y/click-events-have-key-events',
        'jsx-a11y/no-noninteractive-element-interactions',
      ],
      'index-key': ['react-x/no-array-index-key'],
      'missing-dependency': ['react-hooks/exhaustive-deps'],
    });
  });

  it('flags Testing Library misuse in .test.jsx files and passes the allowed one', () => {
    expect(ruleIdsOf('test/ui')).toEqual({
      'allowed.test': [],
      'fire-event.test': ['testing-library/prefer-user-event'],
      'hook-spy.test': ['nitpicker/react-test-no-implementation-details'],
      'test-id.test': ['testing-library/no-test-id-queries'],
    });
  });

  it('keeps the type-aware rules that need no type to be wrong off for JSX handlers', async () => {
    const composed = await linterConfigFor({ root: fixtureRoot, policy: { preset: 'javascript' } });
    const eslint = new ESLint({
      cwd: fixtureRoot,
      overrideConfigFile: true,
      overrideConfig: composed,
    });
    const rules = fieldsOf(
      fieldOf(await eslint.calculateConfigForFile('src/main/ui/allowed.jsx'), 'rules'),
    );

    expect(rules['@typescript-eslint/no-confusing-void-expression']).toEqual([
      2,
      { ignoreVoidReturningFunctions: true },
    ]);
    expect(rules['@typescript-eslint/no-misused-promises']).toEqual([
      2,
      { checksVoidReturn: { attributes: false } },
    ]);
    expect(rules['react-x/no-leaked-conditional-rendering']).toBeUndefined();
    expect(rules['react-hooks/rules-of-hooks']).toEqual([2]);
  });
});
