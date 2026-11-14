import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf, parseJson } from '../../../../../shared/values/readers.mts';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import {
  loadTypeScript,
  preEmitDiagnostics,
} from '../../../adapters/typecheck/typescript-program.mts';
import {
  layoutTransformFor,
  resolveHeadPolicy,
  resolveLayoutFor,
  validateConfig,
  withHeadCheckoutFacts,
} from '../test-support/policy-views.mts';
import type { Policy } from '../test-support/policy-views.mts';
import { useTemporaryProjects } from '../../test-support/temporary-projects.mts';
import { typescriptIgnoredNotices as untypedTypescriptIgnoredNotices } from '../ignored-notices.mjs';
import { typescriptVersion as untypedTypescriptVersion } from '../../modules/tsconfig-files.mjs';
import {
  projectStrictValues as untypedProjectStrictValues,
  projectTsconfigFiles as untypedProjectTsconfigFiles,
  readTypescriptProjectConfig as untypedReadTypescriptProjectConfig,
} from './typescript-project-options.mjs';

type ProjectLayout = { javascript: boolean; sourceRoots: string[] };

const typescriptIgnoredNotices: (options: {
  config: Record<string, unknown>;
  projectRoot: string;
}) => unknown = untypedTypescriptIgnoredNotices;
const typescriptVersion: () => string = untypedTypescriptVersion;
const projectStrictValues: (options: Record<string, unknown>, javascript: boolean) => unknown =
  untypedProjectStrictValues;
const projectTsconfigFiles: (projectRoot: string, layout: ProjectLayout) => string[] =
  untypedProjectTsconfigFiles;
const readTypescriptProjectConfig: (
  projectRoot: string,
  layout: ProjectLayout,
) => { compilerOptions: Record<string, unknown> } = untypedReadTypescriptProjectConfig;

const { projectWith } = useTemporaryProjects('nitpicker-ts-options-', { resolveSymlinks: true });

const options = (compilerOptions: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ compilerOptions, ...extra });
const ORDERINGS = [['nitpicker'], ['project'], ['project', 'nitpicker'], ['nitpicker', 'project']];
const EACH_ORDERING = ORDERINGS.map((precedence) => [precedence]);

const TSCONFIG = JSON.stringify({
  extends: './tsconfig.base.json',
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    lib: ['ES2022'],
    types: [],
  },
  include: ['src'],
});
const RELAXED_BASE = JSON.stringify({
  compilerOptions: { lib: ['ES2022'], types: [], strict: false, noUncheckedIndexedAccess: false },
});
const SOURCE = [
  'export function first(rows: string[]): string {',
  '  return rows[0].toUpperCase();',
  '}',
  'export function loose(value) {',
  '  return value;',
  '}',
  'export function sign(n: number) {',
  '  if (n > 0) {',
  '    return 1;',
  '  }',
  '}',
  '',
].join('\n');

function relaxedProject(base = RELAXED_BASE) {
  return projectWith({
    'tsconfig.json': TSCONFIG,
    'tsconfig.base.json': base,
    'src/a.ts': SOURCE,
  });
}

function policyFor(precedence: string[], root: string) {
  return resolveHeadPolicy({ tools: { typescript: { precedence } } }, root);
}

function generatedConfig(name: string, policy: Policy, root: string) {
  const text = readFileSync(
    path.join(PACKAGE_ROOT, 'languages/typescript/preset/defaults', name),
    'utf8',
  );
  const target = path.join(root, `.nitpicker-diff-${name}`);
  writeFileSync(target, layoutTransformFor(name, resolveLayoutFor(policy))(text, target));
  return target;
}

function compilerOptionsIn(file: string): Readonly<Record<string, unknown>> {
  return fieldsOf(fieldOf(parseJson(readFileSync(file, 'utf8')), 'compilerOptions'));
}

async function errorCodes(engine: string, configPath: string, root: string) {
  const ts = loadTypeScript(PACKAGE_ROOT);
  const diagnostics = await preEmitDiagnostics({
    ts,
    engine,
    configPath,
    configName: undefined,
    projectRoot: root,
    projectNative: undefined,
  });
  return [...new Set(diagnostics.map(({ code }) => code))].toSorted();
}

const STRICT_ERRORS = [2532, 7006, 7030];
const RELAXED_ERRORS = [7030];

describe('the project tsconfig compiler options', () => {
  it.each(EACH_ORDERING)('decide the type check with %j on both engines', async (precedence) => {
    const root = relaxedProject();
    const configPath = generatedConfig('tsconfig.quality.json', policyFor(precedence, root), root);
    const expected = precedence[0] === 'project' ? RELAXED_ERRORS : STRICT_ERRORS;

    expect(await errorCodes('native', configPath, root)).toEqual(expected);
    expect(await errorCodes('project', configPath, root)).toEqual(expected);
  });

  it.each(EACH_ORDERING)('decide the mutation tsconfig with %j', (precedence) => {
    const root = relaxedProject();
    const compilerOptions = compilerOptionsIn(
      generatedConfig('tsconfig.stryker.json', policyFor(precedence, root), root),
    );
    const projectFirst = precedence[0] === 'project';

    const { strict, noImplicitAny, noUncheckedIndexedAccess, noImplicitReturns } = compilerOptions;

    expect({ strict, noImplicitAny, noUncheckedIndexedAccess, noImplicitReturns }).toEqual({
      strict: !projectFirst,
      noImplicitAny: !projectFirst,
      noUncheckedIndexedAccess: !projectFirst,
      noImplicitReturns: true,
    });
  });

  it('apply the head checkout values to a base snapshot whose tsconfig is still strict', async () => {
    const head = policyFor(['project'], relaxedProject());
    const base = withHeadCheckoutFacts(
      { tools: { typescript: { precedence: ['project'] } } },
      head,
    );
    const baseRoot = relaxedProject('{"compilerOptions":{}}');

    expect(base.tools.typescript).toEqual(head.tools.typescript);
    const configPath = generatedConfig('tsconfig.quality.json', base, baseRoot);
    expect(await errorCodes('native', configPath, baseRoot)).toEqual(RELAXED_ERRORS);
  });

  it('let strict decide the strict family members the project leaves out', () => {
    expect(
      projectStrictValues({ strict: false, strictNullChecks: true, target: 99 }, false),
    ).toEqual({
      strict: false,
      noImplicitAny: false,
      strictNullChecks: true,
      strictFunctionTypes: false,
      strictBindCallApply: false,
      strictPropertyInitialization: false,
      noImplicitThis: false,
      useUnknownInCatchVariables: false,
    });
    expect(projectStrictValues({ strictNullChecks: false }, false)).toEqual({
      strictNullChecks: false,
      strictPropertyInitialization: false,
      exactOptionalPropertyTypes: false,
    });
    expect(projectStrictValues({ exactOptionalPropertyTypes: false }, true)).toEqual({});
    expect(projectStrictValues({ exactOptionalPropertyTypes: false }, false)).toEqual({
      exactOptionalPropertyTypes: false,
    });
  });

  it.each([
    [{}, {}, '"tools.typescript.precedence" lists "project" but a tsconfig.json is missing'],
    [{ preset: 'javascript' }, {}, 'but a tsconfig.json or jsconfig.json is missing'],
    [{}, { 'tsconfig.json': '{"compilerOptions": [' }, 'tsconfig.json cannot be read'],
    [
      {},
      { 'tsconfig.json': '{"extends": "./missing.json"}' },
      `tsconfig.json cannot be read by TypeScript ${typescriptVersion()}: Cannot read file`,
    ],
  ])(
    'are a tool error when the tsconfig is missing or cannot be read: %j %j',
    (config, files, message) => {
      const root = projectWith(files);
      const policy = resolveHeadPolicy(
        { ...config, tools: { typescript: { precedence: ['project', 'nitpicker'] } } },
        root,
      );

      expect(policy.tools.typescript.projectConfigError?.includes(message)).toBe(true);
      expect(() => generatedConfig('tsconfig.quality.json', policy, root)).toThrow(message);
    },
  );

  it('are a tool error when the tsconfig is a link that leaves the project', () => {
    const outside = projectWith({ 'shared.json': '{}' });
    const root = projectWith({ 'src/a.ts': SOURCE });
    symlinkSync(path.join(outside, 'shared.json'), path.join(root, 'tsconfig.json'));

    expect(policyFor(['project'], root).tools.typescript.projectConfigError).toBe(
      'tsconfig.json must stay inside the project',
    );
  });

  it('are not read without the opt-in, even when the tsconfig cannot be parsed', () => {
    const root = projectWith({ 'tsconfig.json': '{"compilerOptions": [' });

    expect(policyFor(['nitpicker'], root).tools.typescript).toEqual({ precedence: ['nitpicker'] });
  });
});

describe('the TypeScript precedence setting', () => {
  const PRESETS = [undefined, 'typescript', 'javascript'];
  const PRESET_ORDERINGS = PRESETS.flatMap((preset) =>
    ORDERINGS.map((precedence) => [preset, precedence]),
  );

  it.each(PRESET_ORDERINGS)('accepts the ordering with the preset %j: %j', (preset, precedence) => {
    const config = { preset, tools: { typescript: { engine: 'native', precedence } } };

    expect(validateConfig(config)).toEqual(config);
  });

  it('rejects a repeated ordering entry and a selected config', () => {
    expect(() =>
      validateConfig({ tools: { typescript: { precedence: ['project', 'project'] } } }),
    ).toThrow('"tools.typescript.precedence" must list "project", "nitpicker" or both');
    expect(() =>
      validateConfig({
        tools: { typescript: { project: 'tsconfig.app.json', precedence: ['project'] } },
      }),
    ).toThrow('"tools.typescript.precedence" cannot be combined with "tools.typescript.project"');
  });

  it('prints a notice for the strict options the tsconfig relaxes while not opted in', () => {
    const root = relaxedProject();
    const notices = (config: Record<string, unknown>) =>
      typescriptIgnoredNotices({ config, projectRoot: root });

    expect(notices({})).toEqual([
      'Ignoring strict: false, noUncheckedIndexedAccess: false in tsconfig.json; opt in with "tools": { "typescript": { "precedence": ["project", "nitpicker"] } }',
    ]);
    expect(notices({ tools: { typescript: { precedence: ['nitpicker'] } } })).toEqual(notices({}));
    expect(notices({ tools: { typescript: { precedence: ['nitpicker', 'project'] } } })).toEqual(
      [],
    );
    expect(notices({ tools: { typescript: { project: 'tsconfig.json' } } })).toEqual([]);
    expect(typescriptIgnoredNotices({ config: {}, projectRoot: relaxedProject('{}') })).toEqual([]);
  });

  it('says so when the tsconfig cannot be read to look for relaxed strict options', () => {
    const root = projectWith({ 'tsconfig.json': '{"compilerOptions": [' });

    expect(typescriptIgnoredNotices({ config: {}, projectRoot: root })).toEqual([
      'Could not check the tsconfig for relaxed strict options: tsconfig.json cannot be read by TypeScript ' +
        `${typescriptVersion()}: ']' expected.`,
    ]);
  });
});

describe('the project tsconfig compiler options that nitpicker owns or does not read', () => {
  const OWNED = { allowJs: true, noCheck: false, noEmit: true, skipLibCheck: true };
  const strictness = (compilerOptions: Record<string, unknown>) =>
    projectWith({
      'tsconfig.json': JSON.stringify({ compilerOptions, include: ['src'] }),
      'src/a.ts': SOURCE,
    });
  const pickedOwned = (compilerOptions: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.entries(compilerOptions).filter(([option]) => option in OWNED));
  const compilerOptionsOf = (name: string, precedence: string[], root: string) =>
    compilerOptionsIn(generatedConfig(name, policyFor(precedence, root), root));

  it.each(
    [
      { allowJs: false, noCheck: true, noEmit: false, skipLibCheck: false },
      { allowJs: true, noCheck: false, noEmit: true, skipLibCheck: true },
    ].flatMap((compilerOptions) =>
      ORDERINGS.map((precedence) => [compilerOptions, precedence] as const),
    ),
  )('keep %j out of the project values with the ordering %j', (compilerOptions, precedence) => {
    const root = strictness(compilerOptions);
    const quality = compilerOptionsOf('tsconfig.quality.json', precedence, root);
    const mutation = compilerOptionsOf('tsconfig.stryker.json', precedence, root);

    expect(pickedOwned(quality)).toEqual(OWNED);
    expect(pickedOwned(mutation)).toEqual({ noCheck: false, skipLibCheck: true });
  });

  it('still type checks when the project turns checking off', async () => {
    const root = relaxedProject(
      JSON.stringify({ compilerOptions: { lib: ['ES2022'], types: [], noCheck: true } }),
    );
    const configPath = generatedConfig('tsconfig.quality.json', policyFor(['project'], root), root);

    expect(await errorCodes('native', configPath, root)).toEqual(STRICT_ERRORS);
  });

  it('lets the value of alwaysStrict the project sets win, outside the strict family', () => {
    expect(projectStrictValues({ strict: false, alwaysStrict: false }, true)).toEqual({
      strict: false,
      noImplicitAny: false,
      strictNullChecks: false,
      strictFunctionTypes: false,
      strictBindCallApply: false,
      strictPropertyInitialization: false,
      noImplicitThis: false,
      useUnknownInCatchVariables: false,
      alwaysStrict: false,
    });
  });

  it('read the jsconfig.json of a JavaScript project without a tsconfig.json', () => {
    const root = projectWith({ 'jsconfig.json': options({ strict: false }), 'src/a.js': '' });
    const policy = resolveHeadPolicy(
      { preset: 'javascript', tools: { typescript: { precedence: ['project'] } } },
      root,
    );

    expect(policy.tools.typescript.projectConfig?.compilerOptions?.['strict']).toBe(false);
    expect(() =>
      readTypescriptProjectConfig(root, { javascript: false, sourceRoots: ['src'] }),
    ).toThrow('a tsconfig.json is missing');
  });

  it('prefers the tsconfig.json to a jsconfig.json and follows a solution config', () => {
    const root = projectWith({
      'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }),
      'tsconfig.app.json': options({ strict: false }, { include: ['src'] }),
      'jsconfig.json': options({ strict: true }),
      'src/a.ts': SOURCE,
    });
    const layout = { javascript: true, sourceRoots: ['src'] };

    expect(readTypescriptProjectConfig(root, layout).compilerOptions['strict']).toBe(false);
    expect(projectTsconfigFiles(root, layout)).toEqual(['tsconfig.app.json', 'tsconfig.json']);
  });
});

describe('the head policy when the opt-in changes', () => {
  it('lets a base that opted in follow a head that removed the opt-in', () => {
    const baseRoot = relaxedProject();
    const head = policyFor(['nitpicker'], baseRoot);
    const base = withHeadCheckoutFacts(
      { tools: { typescript: { precedence: ['project'] } } },
      head,
    );

    expect(base.tools.typescript).toEqual({ precedence: ['nitpicker'] });
    expect(() => generatedConfig('tsconfig.quality.json', base, baseRoot)).not.toThrow();
    expect(() =>
      withHeadCheckoutFacts({ tools: { typescript: { precedence: ['project'] } } }, {}),
    ).not.toThrow();
  });

  it('does not read the tsconfig while nitpicker wins every option the project could set', () => {
    const roots = [projectWith({}), projectWith({ 'tsconfig.json': '{"compilerOptions": [' })];
    const pairs = roots.map((root) => ({
      root,
      policy: policyFor(['nitpicker', 'project'], root),
    }));
    const policies = pairs.map(({ policy }) => policy);
    const builds = pairs.map(
      ({ root, policy }) =>
        () =>
          generatedConfig('tsconfig.quality.json', policy, root),
    );

    expect(policies.map((policy) => policy.tools.typescript)).toEqual([
      { precedence: ['nitpicker', 'project'] },
      { precedence: ['nitpicker', 'project'] },
    ]);
    expect(builds.map((build) => build())).toHaveLength(2);
  });
});
