import path from 'node:path';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { createFixService } from '../../code-fixes/language-service.mts';
import {
  globMatcher as untypedGlobMatcher,
  resolveLayoutFor as untypedResolveLayoutFor,
  toPosix as untypedToPosix,
} from '../../../preset/layout.mjs';
import { configFileGlobsFor as untypedConfigFileGlobsFor } from '../../../preset/eslint-config/policy/production-policy.mjs';
import type { FixContext, FixInputs, FixLayout, Project } from '../typed/project-types.mts';

type ProjectSettings = {
  readonly projectRoot: string;
  readonly files: readonly { readonly path: string }[];
  readonly read: (name: string) => string | undefined;
  readonly javascript: boolean;
};

const ts = typescriptApi();
const globMatcher: (glob: string) => { test(name: string): boolean } = untypedGlobMatcher;
const resolveLayoutFor: () => FixLayout = untypedResolveLayoutFor;
const toPosix: (file: string) => string = untypedToPosix;
const configFileGlobsFor: (layout: FixLayout) => readonly string[] = untypedConfigFileGlobsFor;

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const SKIPPED_DIRECTORIES = ['node_modules', 'dist', 'build', 'coverage', '.git'];

function projectNames(projectRoot: string, files: readonly { readonly path: string }[]): string[] {
  const listed = ts.sys
    .readDirectory(
      projectRoot,
      EXTENSIONS,
      SKIPPED_DIRECTORIES.map((name) => `**/${name}`),
    )
    .map((file) => toPosix(path.relative(projectRoot, file)));
  return [...new Set([...files.map(({ path: name }) => name), ...listed])].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function isInside(relative: string): boolean {
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function createProject({ projectRoot, files, read, javascript }: ProjectSettings): Project {
  const listed = projectNames(projectRoot, files);
  const names = listed.filter((name) => read(name) !== undefined);
  const fixService = createFixService({ projectRoot, javascript, names });
  const setText: (name: string, text: string | undefined) => void = fixService.setText;
  for (const name of listed) {
    setText(name, read(name));
  }
  const { service, absolute, host } = fixService;
  const program = service.getProgram();
  if (program === undefined) {
    throw new TypeError('The language service did not create a program');
  }
  const options = program.getCompilerOptions();
  const known = new Set(names);

  function nameOf(file: string): string | undefined {
    const relative = toPosix(path.relative(projectRoot, file));
    return isInside(relative) && !/(?:^|\/)node_modules\//u.test(relative) ? relative : undefined;
  }

  return {
    ts,
    projectRoot,
    service,
    program,
    absolute,
    names,
    read,
    nameOf,
    has: (name: string) => known.has(name),
    sourceFile: (name: string) => program.getSourceFile(absolute(name)),
    resolve(specifier: string, from: string): string | undefined {
      const { resolvedModule } = ts.resolveModuleName(specifier, absolute(from), options, host);
      const resolved =
        resolvedModule === undefined ? undefined : nameOf(resolvedModule.resolvedFileName);
      return resolved !== undefined && known.has(resolved) ? resolved : undefined;
    },
    lineOf: (name: string, offset: number) =>
      (read(name) ?? '').slice(0, offset).split('\n').length,
    dispose(): void {
      service.dispose();
    },
  };
}

export function withProject<T>(context: FixContext, work: (project: Project) => T): T {
  const project = createProject({
    projectRoot: context.projectRoot,
    files: context.files,
    read: context.read,
    javascript: context.inputs?.layout?.javascript === true,
  });
  try {
    return work(project);
  } finally {
    project.dispose();
  }
}

export function layoutOf(inputs: FixInputs = {}): FixLayout {
  return inputs.layout ?? resolveLayoutFor();
}

const CODE_FILE = /\.[cm]?[jt]sx?$/u;

export function isCodeFile(name: string): boolean {
  return CODE_FILE.test(name);
}

export function productionScope(
  inputs: FixInputs | undefined,
  extraGlobs: string[] = [],
): (name: string) => boolean {
  const layout = layoutOf(inputs);
  const configFiles = [...configFileGlobsFor(layout), ...extraGlobs].map(globMatcher);
  return (name) =>
    CODE_FILE.test(name) && layout.isSourceFile(name) && !configFiles.some((m) => m.test(name));
}
