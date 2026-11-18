import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { ORM_ENTITIES, ORM_PACKAGE_FILES, prismaSchema } from './orm-packages.mts';
import { typescriptRuleTester, type TypedRuleTester } from '../rule-tester.mts';

type OrmProjectOptions = {
  readonly provider?: string;
  readonly dependencies?: readonly string[];
  readonly typeormVersion?: string;
  readonly prismaVersion?: string | null;
  readonly files?: Readonly<Record<string, string>>;
};

type OrmProject = {
  readonly root: string;
  readonly tester: TypedRuleTester;
  readonly typed: (code: string) => { filename: string; code: string };
  readonly untyped: (code: string) => { code: string };
};

const COMPILER_OPTIONS = {
  strict: true,
  module: 'esnext',
  moduleResolution: 'bundler',
  target: 'es2022',
  noEmit: true,
  types: [],
  lib: ['ES2022'],
  experimentalDecorators: true,
};

const PRISMA_VERSION = '6.1.0';

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content}\n`);
}

function versionOf(name: string, options: OrmProjectOptions): string | null {
  if (name === 'typeorm') {
    return options.typeormVersion ?? '0.3.20';
  }
  if (name !== '@prisma/client') {
    return '4.6.0';
  }
  return options.prismaVersion === undefined ? PRISMA_VERSION : options.prismaVersion;
}

function writePackages(root: string, options: OrmProjectOptions): void {
  const modules = path.join(root, 'node_modules');
  for (const [file, content] of Object.entries(ORM_PACKAGE_FILES)) {
    write(path.join(modules, file), content);
  }
  const names = ['typeorm', '@prisma/client', 'ioredis', '@redis/client', 'redis'];
  for (const name of names) {
    const version = versionOf(name, options);
    write(
      path.join(modules, name, 'package.json'),
      JSON.stringify({ name, ...(version === null ? {} : { version }), types: 'index.d.ts' }),
    );
  }
  write(
    path.join(modules, '.prisma/client/schema.prisma'),
    prismaSchema(options.provider ?? 'postgresql'),
  );
}

export function ormProject(prefix: string, options: OrmProjectOptions = {}): OrmProject {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `nitpicker-${prefix}-`)));
  writePackages(root, options);
  write(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: COMPILER_OPTIONS, include: ['src'] }),
  );
  if (options.dependencies !== undefined) {
    const dependencies = Object.fromEntries(options.dependencies.map((name) => [name, '*']));
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies }));
  }
  write(path.join(root, 'src/entities.ts'), ORM_ENTITIES);
  for (const [name, content] of Object.entries(options.files ?? {})) {
    write(path.join(root, 'src', name), content);
  }
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  let count = 0;
  function typed(code: string) {
    count += 1;
    const filename = path.join(root, 'src', `case-${String(count)}.ts`);
    writeFileSync(filename, code);
    return { filename, code };
  }
  return {
    root,
    tester: typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root }),
    typed,
    untyped: (code) => ({ code }),
  };
}
