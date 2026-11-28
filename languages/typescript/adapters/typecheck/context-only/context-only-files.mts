import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import type { Layout } from '../../typed/head-policy.mts';
import { valueOr } from '../../../../../shared/values/attempt/attempt.mts';

type ProgramContext = {
  readonly ts: typeof TypeScript;
  readonly configPath: string;
  readonly config: object;
};

function programFiles(context: ProgramContext): ReadonlySet<string> {
  const { ts, configPath, config } = context;
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    ...(parsed.projectReferences === undefined
      ? {}
      : { projectReferences: parsed.projectReferences }),
  });
  return new Set(program.getSourceFiles().map((file) => path.resolve(file.fileName)));
}

type FileScope = {
  readonly configPath: string;
  readonly projectRoot: string;
  readonly layout: Layout;
};

type CompilerScope = {
  readonly layout: Layout;
  readonly ts: typeof TypeScript;
};

function listedFiles(config: object): readonly string[] {
  const listed = 'files' in config && Array.isArray(config.files) ? config.files : [];
  return listed.filter((file: unknown): file is string => typeof file === 'string');
}

function layoutRoots(config: object, scope: FileScope): readonly string[] {
  return listedFiles(config).filter((file) => {
    const absolute = path.resolve(path.dirname(scope.configPath), file);
    const relative = path.relative(scope.projectRoot, absolute).replaceAll('\\', '/');
    return (
      !scope.layout.isExcluded(relative) &&
      (scope.layout.isSourceFile(relative) || scope.layout.isTestFile(relative))
    );
  });
}

function insideRelative(root: string, file: string): string | undefined {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const outside = relative === '..' || relative.startsWith('../') || path.isAbsolute(relative);
  return outside ? undefined : relative;
}

function projectRelative(projectRoot: string, files: readonly string[]): readonly string[] {
  const roots = [...new Set([projectRoot, realpathSync(projectRoot)])];
  return files
    .map((file) =>
      roots.map((root) => insideRelative(root, file)).find((each) => each !== undefined),
    )
    .filter((file) => file !== undefined);
}

export type ProgramFileLists = {
  readonly complete: readonly string[];
  readonly scoped: readonly string[];
};

function readConfig(configPath: string): object | undefined {
  const text = readFileSync(configPath, 'utf8');
  const config = valueOr((): unknown => JSON.parse(text), undefined);
  return typeof config === 'object' && config !== null ? config : undefined;
}

export function contextRoots(
  configPath: string,
  projectRoot: string,
  layout: Layout,
): readonly string[] | undefined {
  const config = readConfig(configPath);
  if (config === undefined) {
    return undefined;
  }
  const roots = layoutRoots(config, { configPath, projectRoot, layout });
  return roots.length === listedFiles(config).length ? undefined : roots;
}

export function contextOnlyOf(
  projectRoot: string,
  { complete, scoped }: ProgramFileLists,
): ReadonlySet<string> {
  const reached = new Set(scoped.map((file) => path.resolve(file)));
  const contextOnly = complete
    .map((file) => path.resolve(file))
    .filter((file) => !reached.has(file));
  return new Set(projectRelative(projectRoot, contextOnly));
}

export function contextOnlyFiles(
  configPath: string,
  projectRoot: string,
  { layout, ts }: CompilerScope,
): ReadonlySet<string> {
  const config = readConfig(configPath);
  const roots = contextRoots(configPath, projectRoot, layout);
  if (config === undefined || roots === undefined) {
    return new Set();
  }
  return contextOnlyOf(projectRoot, {
    complete: [...programFiles({ ts, configPath, config })],
    scoped: [...programFiles({ ts, configPath, config: { ...config, files: roots } })],
  });
}
