import path from 'node:path';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { ProgramInputs } from '../program.mts';
import type { ContextLayout, FileInfo } from '../typed/context-types.mts';
import type { PackagesInfo } from '../workspace/workspace-types.mts';
import { fileEntry, isOwnablePath } from '../context.mts';

type FileInput = Pick<FileInfo, 'path' | 'role' | 'packageDir' | 'insideProject'> & {
  readonly ownable: boolean;
};

export type EngineFiles = {
  readonly entries: ReadonlyMap<string, FileInfo>;
  readonly input: Readonly<Record<string, FileInput>>;
};

type FilesRequest = {
  readonly rootNames: readonly string[];
  readonly projectRoot: string;
  readonly packagesInfo: PackagesInfo;
  readonly layout: ContextLayout;
};

const ts = typescriptApi();
const DECLARATION_FILE = /\.d\.(?:[cm]?ts|[^./]+\.ts)$/u;

function absolutePaths(
  paths: Readonly<Record<string, readonly string[]>>,
  base: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(paths).map(([pattern, targets]) => [
      pattern,
      targets.map((target) => path.resolve(base, target)),
    ]),
  );
}

export function engineProjectConfig(
  { parsed, options, rootNames }: ProgramInputs,
  { configPath, projectRoot }: { readonly configPath: string; readonly projectRoot: string },
): unknown {
  const pathsBase = String(options.baseUrl ?? options['pathsBasePath'] ?? projectRoot);
  return {
    extends: path.resolve(configPath),
    compilerOptions: {
      noEmit: true,
      allowJs: true,
      checkJs: false,
      skipLibCheck: true,
      types: [],
      typeRoots: ts.getEffectiveTypeRoots(options, ts.sys) ?? [],
      ...(parsed.options.jsx === undefined ? { jsx: 'react-jsx' } : {}),
      paths: absolutePaths(options.paths ?? {}, pathsBase),
    },
    files: rootNames,
    include: [],
    exclude: [],
  };
}

export function engineFiles({
  rootNames,
  projectRoot,
  packagesInfo,
  layout,
}: FilesRequest): EngineFiles {
  const sources = rootNames.filter((fileName) => !DECLARATION_FILE.test(fileName));
  const entries = new Map(
    sources.map((fileName): [string, FileInfo] => [
      fileName,
      fileEntry({ fileName, projectRoot, packagesInfo, layout }),
    ]),
  );
  const input = Object.fromEntries(
    [...entries].map(([fileName, { path: file, role, packageDir, insideProject }]) => [
      fileName,
      {
        path: file,
        role,
        packageDir,
        insideProject,
        ownable: isOwnablePath(entries.get(fileName), layout),
      },
    ]),
  );
  return { entries, input };
}
