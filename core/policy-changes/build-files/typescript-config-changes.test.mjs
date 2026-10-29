import { describe, expect, it } from 'vitest';
import { between, changesOf } from './test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };
const NONE = { policyLoosenings: [], policyChanges: [] };
const options = (compilerOptions) => `${JSON.stringify({ compilerOptions })}\n`;
const STRICT = options({ strict: true, noUncheckedIndexedAccess: true });
const RELAXED = options({ strict: true, noUncheckedIndexedAccess: false });
const STRICT_OPTION = '{ "noUncheckedIndexedAccess": true }';
const RELAXED_OPTION = '{ "noUncheckedIndexedAccess": false }';
const PRESETS = [undefined, 'javascript'];

const at = (base, extra = {}) => ({
  'tsconfig.json': '{ "extends": "./config/tsconfig.base.json", "include": ["src"] }\n',
  'config/tsconfig.base.json': base,
  'src/a.ts': 'export const a = 1;\n',
  ...extra,
});

describe('the TypeScript compiler options the project opted into', () => {
  it.each(PRESETS)(
    'lists a strict option moving to a weaker value with the %s preset',
    (preset) => {
      const config = { preset, tools: { typescript: PROJECT } };

      expect(between({ base: at(STRICT), head: at(RELAXED), config }).policyLoosenings).toEqual([
        'typescript tsconfig.json noUncheckedIndexedAccess: true -> false',
      ]);
      expect(
        between({ base: at(STRICT), head: at(RELAXED), config: { preset } }).policyLoosenings,
      ).toEqual([]);
    },
  );

  it('lists every option a relaxed strict flag turns off', () => {
    const config = { tools: { typescript: PROJECT } };
    const { policyLoosenings } = between({
      base: at(STRICT),
      head: at(options({ strict: false })),
      config,
    });

    expect(policyLoosenings).toEqual(
      [
        'exactOptionalPropertyTypes',
        'noImplicitAny',
        'noImplicitThis',
        'strict',
        'strictBindCallApply',
        'strictFunctionTypes',
        'strictNullChecks',
        'strictPropertyInitialization',
        'useUnknownInCatchVariables',
      ].map((option) => `typescript tsconfig.json ${option}: true -> false`),
    );
  });

  it('lists a tightening as a plain change and ignores options nitpicker does not read', () => {
    const config = { tools: { typescript: PROJECT } };
    const reformatted = `// shared\n{\n  "compilerOptions": { "noUncheckedIndexedAccess": true, "strict": true,\n    "paths": { "@/*": ["src/*"] }, "target": "ES2020" }\n}\n`;

    expect(changesOf(between({ base: at(RELAXED), head: at(STRICT), config }))).toEqual({
      policyLoosenings: [],
      policyChanges: ['typescript tsconfig.json noUncheckedIndexedAccess: false -> true'],
    });
    expect(changesOf(between({ base: at(STRICT), head: at(reformatted), config }))).toEqual(NONE);
    expect(
      changesOf(
        between({
          base: at(STRICT),
          head: at(STRICT, { 'tsconfig.json': '{ "extends": "./config/tsconfig.base.json" }\n' }),
          config,
        }),
      ),
    ).toEqual(NONE);
  });

  it('judges nothing while nitpicker wins every option the project could set', () => {
    const config = { tools: { typescript: { precedence: ['nitpicker', 'project'] } } };

    expect(changesOf(between({ base: at(STRICT), head: at(RELAXED), config }))).toEqual(NONE);
  });

  it('lists the files of the chain when the change opts in', () => {
    expect(
      between({
        base: at(RELAXED),
        head: at(RELAXED),
        baseConfig: {},
        config: { tools: { typescript: PROJECT } },
      }).policyLoosenings,
    ).toEqual([
      'typescript project config changed: config/tsconfig.base.json',
      'typescript project config changed: tsconfig.json',
      'tools.typescript.precedence: not set -> ["project","nitpicker"]',
    ]);
  });

  it('falls back to the files of the chain when a side cannot be read', () => {
    const config = { tools: { typescript: PROJECT } };

    expect(
      between({ base: at('{ "compilerOptions": ['), head: at(RELAXED), config }).policyLoosenings,
    ).toEqual(['typescript project config changed: config/tsconfig.base.json']);
  });

  it('follows the config a solution tsconfig picks, and the solution itself', () => {
    const config = { tools: { typescript: PROJECT } };
    const project = (picked) => ({
      'tsconfig.json': JSON.stringify({ files: [], references: [{ path: picked }] }),
      'tsconfig.app.json': `{ "include": ["src"], "compilerOptions": ${RELAXED_OPTION} }`,
      'tsconfig.web.json': `{ "include": ["src"], "compilerOptions": ${STRICT_OPTION} }`,
      'src/a.ts': 'export const a = 1;\n',
    });

    expect(
      between({
        base: project('./tsconfig.web.json'),
        head: project('./tsconfig.app.json'),
        config,
      }).policyLoosenings,
    ).toEqual([
      'tsconfig removed: tsconfig.web.json',
      'typescript tsconfig.app.json noUncheckedIndexedAccess: true -> false',
    ]);
  });

  it('follows a file the config extends above the project root', () => {
    const monorepo = (base) => ({
      'tsconfig.base.json': base,
      'packages/app/tsconfig.json': '{ "extends": "../../tsconfig.base.json", "include": ["src"] }',
      'packages/app/src/a.ts': 'export const a = 1;\n',
    });
    const config = { tools: { typescript: PROJECT } };
    const directory = 'packages/app';

    const loosening = 'typescript tsconfig.json noUncheckedIndexedAccess: true -> false';

    expect(
      changesOf(between({ base: monorepo(STRICT), head: monorepo(RELAXED), config, directory })),
    ).toEqual({ policyLoosenings: [loosening], policyChanges: [loosening] });
    expect(
      changesOf(between({ base: monorepo(STRICT), head: monorepo(STRICT), config, directory })),
    ).toEqual(NONE);
  });

  it.each(['@org/cfg/tsconfig.json', '@org/cfg'])(
    'follows a package the config extends by name (%s)',
    (specifier) => {
      const config = { tools: { typescript: PROJECT } };
      const withPackage = (compilerOptions) => ({
        'tsconfig.json': JSON.stringify({ extends: specifier, include: ['src'] }),
        'node_modules/@org/cfg/package.json': '{ "name": "@org/cfg", "main": "index.js" }',
        'node_modules/@org/cfg/tsconfig.json': compilerOptions,
        'src/a.ts': 'export const a = 1;\n',
      });

      expect(
        between({ base: withPackage(STRICT), head: withPackage(RELAXED), config }).policyLoosenings,
      ).toEqual(['typescript tsconfig.json noUncheckedIndexedAccess: true -> false']);
    },
  );
});
