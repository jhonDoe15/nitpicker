import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { resolveLayout } from '../layout.mjs';
import { layoutTransformFor } from '../tool-configs.mjs';
import {
  customLayout,
  defaults,
  readDefault,
  removeTemporaryRoots,
  temporaryProject,
} from './test-support/layout-config-helpers.mjs';

afterAll(removeTemporaryRoots);

describe('layout-aware tsconfig', () => {
  const defaultLayout = resolveLayout();
  it('copy the shipped tsconfig, rewritten for the layout, when the project has none', () => {
    const projectRoot = temporaryProject({});
    const shipped = readFileSync(path.join(defaults, 'tsconfig.quality.json'), 'utf8');
    const target = path.join(projectRoot, '.nitpicker-diff-tsconfig.json');
    expect(layoutTransformFor('tsconfig.quality.json', defaultLayout)(shipped, target)).toBe(
      shipped,
    );
    const custom = JSON.parse(
      layoutTransformFor('tsconfig.quality.json', customLayout)(shipped, target),
    );
    expect(custom.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
  });
  it('extend the project tsconfig with the policy flags for type checking', () => {
    const projectRoot = temporaryProject({ 'tsconfig.json': '{}' });
    const transform = layoutTransformFor('tsconfig.quality.json', customLayout);
    const shipped = readFileSync(path.join(defaults, 'tsconfig.quality.json'), 'utf8');
    const layered = JSON.parse(transform(shipped, path.join(projectRoot, '.nitpicker-x.json')));
    expect(layered.extends).toBe('./tsconfig.json');
    expect(layered.compilerOptions).toEqual({
      allowJs: true,
      noCheck: false,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitThis: true,
      useUnknownInCatchVariables: true,
      alwaysStrict: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noPropertyAccessFromIndexSignature: true,
      noUncheckedSideEffectImports: true,
      forceConsistentCasingInFileNames: true,
    });
    expect(layered.compilerOptions).not.toHaveProperty('module');
    expect(layered.compilerOptions).not.toHaveProperty('jsx');
    expect(layered.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect([...new Set(layered.exclude)].sort()).toEqual([
      '**/node_modules/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'generated/**',
      'lib/legacy/**',
      'reports/**',
      'target/**',
    ]);
  });
  describe('over a solution-style project tsconfig', () => {
    const appConfig = `{
      // Bundler mode
      "compilerOptions": { "jsx": "react-jsx", "module": "ESNext", "moduleResolution": "bundler" },
      "include": ["src"]
    }`;
    const nodeConfig =
      '{ "compilerOptions": { "module": "ESNext" }, "include": ["vite.config.ts"] }';
    const solution = (...paths) =>
      JSON.stringify({ files: [], references: paths.map((reference) => ({ path: reference })) });
    function layeredFor(files, name = 'tsconfig.quality.json') {
      const projectRoot = temporaryProject(files);
      const shipped = readFileSync(path.join(defaults, name), 'utf8');
      const target = path.join(projectRoot, '.nitpicker-x.json');
      const layered = layoutTransformFor(name, defaultLayout)(shipped, target);
      writeFileSync(target, layered);
      return { layered: JSON.parse(layered), target };
    }
    it('extends the referenced config that includes the source roots, so its compiler options apply', () => {
      const { layered, target } = layeredFor({
        'tsconfig.json': solution('./tsconfig.node.json', './tsconfig.app.json'),
        'tsconfig.app.json': appConfig,
        'tsconfig.node.json': nodeConfig,
      });

      expect(layered.extends).toBe('./tsconfig.app.json');
      const parsed = ts.getParsedCommandLineOfConfigFile(
        target,
        {},
        { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
      );
      expect(parsed.options.jsx).toBe(ts.JsxEmit.ReactJSX);
    });
    it('follows a reference to a directory, for the mutation tsconfig too', () => {
      const projectRoot = temporaryProject({ 'tsconfig.json': solution('./app') });
      mkdirSync(path.join(projectRoot, 'app'));
      writeFileSync(path.join(projectRoot, 'app', 'tsconfig.json'), appConfig);
      const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');

      const mutation = JSON.parse(
        layoutTransformFor('tsconfig.stryker.json', defaultLayout)(
          shipped,
          path.join(projectRoot, '.nitpicker-x.json'),
        ),
      );

      expect(mutation.extends).toBe('./app/tsconfig.json');
    });
    it.each([
      [
        'no reference includes a source root',
        { 'tsconfig.json': solution('./tsconfig.node.json'), 'tsconfig.node.json': nodeConfig },
      ],
      ['the referenced file is missing', { 'tsconfig.json': solution('./tsconfig.app.json') }],
      [
        'the project config has compiler options of its own',
        {
          'tsconfig.json': JSON.stringify({
            compilerOptions: { strict: true, types: [], lib: ['ES2022'] },
            references: [{ path: './tsconfig.app.json' }],
          }),
          'tsconfig.app.json': appConfig,
        },
      ],
    ])('keeps extending the project tsconfig when %s', (_name, files) => {
      expect(layeredFor(files).layered.extends).toBe('./tsconfig.json');
    });
  });
  it('type-check mutants with the policy compiler options on top of the project tsconfig', () => {
    const projectRoot = temporaryProject({ 'tsconfig.json': '{}' });
    const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');
    const target = path.join(projectRoot, '.nitpicker-x.json');
    const strict = JSON.parse(
      layoutTransformFor('tsconfig.stryker.json', defaultLayout)(shipped, target),
    );
    expect(strict.extends).toBe('./tsconfig.json');
    const {
      skipLibCheck,
      noImplicitReturns,
      noFallthroughCasesInSwitch,
      noUncheckedIndexedAccess,
    } = strict.compilerOptions;
    expect({
      skipLibCheck,
      strict: strict.compilerOptions.strict,
      noImplicitReturns,
      noFallthroughCasesInSwitch,
      noUncheckedIndexedAccess,
    }).toEqual({
      skipLibCheck: true,
      strict: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
    });
    expect(strict.compilerOptions).not.toHaveProperty('module');
    const relaxed = layoutTransformFor('tsconfig.stryker.json', defaultLayout, {
      strictMutants: false,
    })(shipped, target);
    expect(JSON.parse(relaxed)).toEqual({
      extends: './tsconfig.json',
      compilerOptions: { noCheck: false, skipLibCheck: true },
    });
  });
  it('ship the mutation tsconfig with the same indexing and return checks as the type check', () => {
    const quality = readDefault('tsconfig.quality.json').compilerOptions;
    const stryker = readDefault('tsconfig.stryker.json').compilerOptions;
    for (const option of [
      'strict',
      'noImplicitReturns',
      'noFallthroughCasesInSwitch',
      'noUncheckedIndexedAccess',
    ]) {
      expect(stryker[option]).toBe(quality[option]);
    }
  });
  it('drop only the extra strictness from the shipped mutation tsconfig when relaxed', () => {
    const projectRoot = temporaryProject({});
    const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');
    const target = path.join(projectRoot, '.nitpicker-x.json');
    const relaxed = JSON.parse(
      layoutTransformFor('tsconfig.stryker.json', customLayout, { strictMutants: false })(
        shipped,
        target,
      ),
    );
    const { noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, ...kept } =
      readDefault('tsconfig.stryker.json').compilerOptions;
    expect([noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedIndexedAccess]).toEqual([
      true,
      true,
      true,
    ]);
    expect(relaxed.compilerOptions).toEqual(kept);
    expect(relaxed.include).toEqual(['lib/**/*', 'spec/**/*', 'stryker.vitest.config.ts']);
  });
  it.each([
    [
      'removing ?. from an indexed access',
      'export const text = (rows: { text: string }[]): string | undefined => rows[0]?.text;\n',
      'export const text = (rows: { text: string }[]): string | undefined => rows[0].text;\n',
    ],
    [
      'removing a default branch that returns undefined',
      "export const label = (kind: string): string | undefined => {\n  switch (kind) {\n    case 'a':\n      return 'A';\n    default:\n      return undefined;\n  }\n};\n",
      "export const label = (kind: string): string | undefined => {\n  switch (kind) {\n    case 'a':\n      return 'A';\n    default:\n  }\n};\n",
    ],
  ])(
    'reject a mutant made by %s as a compile error, while the original compiles',
    (_name, original, mutant) => {
      const projectTsconfig = JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022'],
          types: [],
        },
        include: ['src'],
      });
      const compileErrors = (source, options) => {
        const projectRoot = temporaryProject({ 'tsconfig.json': projectTsconfig });
        mkdirSync(path.join(projectRoot, 'src'));
        writeFileSync(path.join(projectRoot, 'src', 'mutated.ts'), source);
        const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');
        const configPath = path.join(projectRoot, 'tsconfig.stryker.json');
        writeFileSync(
          configPath,
          layoutTransformFor('tsconfig.stryker.json', defaultLayout, options)(shipped, configPath),
        );
        const parsed = ts.getParsedCommandLineOfConfigFile(
          configPath,
          {},
          { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
        );
        return ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
      };

      expect(compileErrors(original, { strictMutants: true })).toEqual([]);
      expect(compileErrors(mutant, { strictMutants: true })).not.toEqual([]);
      expect(compileErrors(mutant, { strictMutants: false })).toEqual([]);
    },
  );
  it('link through a real policy file installs the layered tsconfig', () => {
    const projectRoot = temporaryProject({ 'tsconfig.json': '{}' });
    const linked = linkPolicyFile(
      path.join(defaults, 'tsconfig.quality.json'),
      path.join(projectRoot, '.nitpicker-diff-tsconfig.json'),
      layoutTransformFor('tsconfig.quality.json', defaultLayout),
    );
    try {
      expect(JSON.parse(readFileSync(linked.targetPath, 'utf8')).extends).toBe('./tsconfig.json');
    } finally {
      linked.remove();
    }
  });
});
