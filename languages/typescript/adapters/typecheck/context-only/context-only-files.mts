import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import type { Layout } from '../../typed/head-policy.mts';
import { loadTypeScript } from '../typescript-program.mts';

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

function projectRelative(projectRoot: string, files: readonly string[]): readonly string[] {
  return files
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .filter((file) => file !== '..' && !file.startsWith('../') && !path.isAbsolute(file));
}

export function contextOnlyFiles(
  configPath: string,
  projectRoot: string,
  layout: Layout,
): ReadonlySet<string> {
  const config: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  if (typeof config !== 'object' || config === null) return new Set();
  const roots = layoutRoots(config, { configPath, projectRoot, layout });
  if (roots.length === listedFiles(config).length) return new Set();
  const ts = loadTypeScript(projectRoot);
  const scoped = programFiles({ ts, configPath, config: { ...config, files: roots } });
  const complete = programFiles({ ts, configPath, config });
  const contextOnly = [...complete].filter((file) => !scoped.has(file));
  return new Set(projectRelative(projectRoot, contextOnly));
}
