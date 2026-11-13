import { readFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { resolveLayout } from '../../layout.mjs';
import { contextOnlyFiles } from '../../../adapters/static-checks/typescript.mts';
import { layoutTransformFor } from '../../tool-configs.mjs';

const ts = createRequire(import.meta.url)('typescript');
const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files, tsconfig) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-root-files-'));
  roots.push(root);
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const [file, text] of Object.entries({ 'tsconfig.json': tsconfig, ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}

function diagnosticCodes(root, configFile) {
  const parsed = ts.getParsedCommandLineOfConfigFile(configFile, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(String(diagnostic.messageText));
    },
  });
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  return ts.getPreEmitDiagnostics(program).map(({ code }) => code);
}

function nitpickerConfig(root, options, name = '.nitpicker-typecheck.json') {
  const transform = layoutTransformFor('tsconfig.quality.json', resolveLayout(), options);
  const target = path.join(root, name);
  writeFileSync(target, transform('{"compilerOptions":{},"include":[],"exclude":[]}', target));
  return target;
}

function nitpickerCodes(root) {
  const transform = layoutTransformFor('tsconfig.quality.json', resolveLayout(), {
    projectRootFiles: true,
  });
  const target = path.join(root, '.nitpicker-typecheck.json');
  writeFileSync(target, transform('{"compilerOptions":{},"include":[],"exclude":[]}', target));
  return diagnosticCodes(root, target);
}

const COMPILER_OPTIONS = {
  module: 'ESNext',
  moduleResolution: 'Bundler',
  noEmit: true,
  strict: true,
  types: [],
};

describe('the type check root files', () => {
  it('include the files the project tsconfig includes, so global types they pull in apply', () => {
    const root = project(
      {
        'src/mode.ts': 'export const mode = process.platform;\n',
        'benchmarks/read.ts':
          '/// <reference types="node" />\nexport const home = process.platform;\n',
      },
      { compilerOptions: COMPILER_OPTIONS, include: ['src', 'benchmarks'] },
    );

    expect(diagnosticCodes(root, path.join(root, 'tsconfig.json'))).toEqual([]);
    expect(nitpickerCodes(root)).toEqual([]);
  });

  it('still report a missing Node global when nothing in the project brings the types', () => {
    const root = project(
      { 'src/mode.ts': 'export const mode = process.platform;\n' },
      { compilerOptions: COMPILER_OPTIONS, include: ['src'] },
    );

    expect(diagnosticCodes(root, path.join(root, 'tsconfig.json'))).toEqual([2591]);
    expect(nitpickerCodes(root)).toEqual([2591]);
  });

  it('keep files outside the layout as context only and leave other tools on the layout files', () => {
    const root = project(
      {
        'src/mode.ts': 'export const mode = process.platform;\n',
        'benchmarks/read.ts':
          '/// <reference types="node" />\nexport const home = process.platform;\n',
      },
      { compilerOptions: COMPILER_OPTIONS, include: ['src', 'benchmarks'] },
    );
    const withFiles = nitpickerConfig(root, { projectRootFiles: true });
    const without = nitpickerConfig(root, undefined, '.nitpicker-plain.json');

    expect([...contextOnlyFiles(withFiles, root, resolveLayout())]).toEqual(['benchmarks/read.ts']);
    expect(JSON.parse(readFileSync(without, 'utf8')).files).toBeUndefined();
  });
});
