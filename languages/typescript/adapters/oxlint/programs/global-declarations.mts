import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { isStrictlyInside } from '../../../../../shared/filesystem.mts';
import { fieldsOf } from '../../../../../shared/values/readers.mts';
import { typescriptApi } from '../../typed/typescript-program.mts';
import { nativeCompilerPath } from '../../typed-engine/compiler-binary.mts';
import { spawnCollected } from '../oxlint-process.mts';

const MAX_LISTING_BYTES = 256 * 1024 * 1024;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;

export type ProgramListing = {
  readonly files: readonly string[];
  readonly libraryDirectory: string;
};

export async function listProgramFiles({
  stage,
  environment,
  timeoutMs,
}: {
  readonly stage: string;
  readonly environment: Environment;
  readonly timeoutMs: number | undefined;
}): Promise<ProgramListing | undefined> {
  const compiler = nativeCompilerPath();
  if (compiler === undefined) {
    return undefined;
  }
  const run = await spawnCollected(compiler, ['--project', 'tsconfig.json', '--listFilesOnly'], {
    cwd: stage,
    env: environment,
    maxBuffer: MAX_LISTING_BYTES,
    timeoutMs,
  });
  if (run.status !== 0 || run.error !== undefined) {
    return undefined;
  }
  const files = run.stdout
    .split(/\r?\n/u)
    .filter((line) => path.isAbsolute(line))
    .map((line) => path.resolve(line));
  return { files, libraryDirectory: path.dirname(compiler) };
}

export function resolvesImports(configPath: string): boolean {
  const ts = typescriptApi();
  const read = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  const parsed = ts.parseJsonConfigFileContent(
    { ...fieldsOf(read.config), include: [], files: [] },
    ts.sys,
    path.dirname(configPath),
  );
  return parsed.options.noResolve !== true;
}

export function globalDeclarationFiles({ files, libraryDirectory }: ProgramListing): string[] {
  const ts = typescriptApi();
  return files.filter(
    (file) =>
      SOURCE_FILE.test(file) &&
      !isStrictlyInside(libraryDirectory, file) &&
      declaresGlobals(ts, file),
  );
}

function declaresGlobals(ts: typeof TypeScript, file: string): boolean {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  if (!ts.isExternalModule(source)) {
    return true;
  }
  const references = [
    source.referencedFiles,
    source.typeReferenceDirectives,
    source.libReferenceDirectives,
  ];
  return (
    references.some((list) => list.length > 0) ||
    source.statements.some((statement) => augments(ts, statement))
  );
}

function augments(ts: typeof TypeScript, statement: TypeScript.Statement): boolean {
  if (ts.isNamespaceExportDeclaration(statement)) {
    return true;
  }
  return (
    ts.isModuleDeclaration(statement) &&
    (ts.isStringLiteral(statement.name) ||
      (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0)
  );
}
