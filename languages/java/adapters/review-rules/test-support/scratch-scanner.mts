import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const PROJECT = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};

type ReadOptions = { readonly projects: readonly unknown[]; readonly kotlin: boolean };

export type ReadFindings<Found> = (projectRoot: string, options: ReadOptions) => Found[];

export type LocatedFinding = {
  readonly rule: string;
  readonly message: string;
  readonly location: { readonly line: number };
};

export function scratchScanner<Found>(options: {
  prefix: string;
  read: ReadFindings<Found>;
}): (files: Readonly<Record<string, string>>, kotlin: boolean) => Found[] {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return (files, kotlin) => {
    const root = mkdtempSync(path.join(tmpdir(), options.prefix));
    roots.push(root);
    for (const [file, text] of Object.entries(files)) {
      const full = path.resolve(root, file);
      if (!full.startsWith(root + path.sep)) {
        throw new Error(`${file} leaves the scratch root`);
      }
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return options.read(root, { projects: [PROJECT], kotlin });
  };
}

export function ruleLineRunners(options: {
  prefix: string;
  read: ReadFindings<LocatedFinding>;
  rule: string;
  className: string;
  javaImports: string;
}): { java: (body: string) => number[]; kotlin: (body: string) => number[] } {
  const scan = scratchScanner({ prefix: options.prefix, read: options.read });
  const { className } = options;
  function lines(file: string, text: string, kotlin: boolean): number[] {
    return scan({ [file]: text }, kotlin)
      .filter(({ rule }) => rule === options.rule)
      .map(({ location }) => location.line);
  }
  return {
    java: (body) =>
      lines(
        `src/main/java/shop/${className}.java`,
        `package shop;\n${options.javaImports}class ${className} {\n${body}\n}\n`,
        false,
      ),
    kotlin: (body) =>
      lines(
        `src/main/kotlin/shop/${className}.kt`,
        `package shop\nclass ${className} {\n${body}\n}\n`,
        true,
      ),
  };
}
