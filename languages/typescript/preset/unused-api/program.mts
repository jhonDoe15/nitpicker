import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import { codeExtensionNames } from '../layout.mts';
import { workspacePaths } from './workspace/entries.mts';
import { relevantSiblingFiles } from './workspace/sibling-imports.mts';
import type { PackageEntry, PackagesInfo, ProgramLayout } from './workspace/workspace-types.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../shared/messages/troubleshooting.mjs';

const ts = typescriptApi();

type WalkedLayout = Pick<ProgramLayout, 'excludedGlobs'>;

const projectFilesUnder: (
  root: string,
  options: {
    readonly includeIgnored: true;
    readonly skipDirectory?: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => string[] = untypedProjectFilesUnder;

const NO_INPUTS = 18_003;
const SCRIPT_DIRECTORIES = ['scripts'];
const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');
const ROOT_CONFIG_FILE = new RegExp(`\\.config\\.(?:${codeExtensionNames.join('|')})$`, 'u');

function configError(diagnostics: readonly TypeScript.Diagnostic[]): Error {
  const messages = diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  return troubleshootingError(
    `The TypeScript config could not be read: ${messages.join('; ')}`,
    TROUBLESHOOTING_ANCHORS.typescriptConfigUnreadable,
  );
}

function parseConfig(configPath: string, projectRoot: string): TypeScript.ParsedCommandLine {
  const configFile = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  if (configFile.error !== undefined) throw configError([configFile.error]);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot,
    { allowJs: true },
    configPath,
  );
  const errors = parsed.errors.filter(({ code }) => code !== NO_INPUTS);
  if (errors.length > 0) throw configError(errors);
  return parsed;
}

function isCodeFile(file: string): boolean {
  return CODE_FILE.test(file) && !file.endsWith('.d.ts');
}

function rootConfigsAndScripts(projectRoot: string, layout: ProgramLayout): string[] {
  const configs = readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ROOT_CONFIG_FILE.test(entry.name))
    .map((entry) => path.join(projectRoot, entry.name));
  const scripts = SCRIPT_DIRECTORIES.map((name) => path.join(projectRoot, name))
    .filter((directory) => existsSync(directory))
    .flatMap((directory) => projectFilesUnder(directory, { includeIgnored: true }));
  return [...configs, ...scripts].filter(
    (file) => isCodeFile(file) && !layout.isExcluded(path.relative(projectRoot, file)),
  );
}

function isSkippedDirectory(
  absolute: string,
  entry: { readonly name: string },
  { layout, projectRoot }: { layout: WalkedLayout; projectRoot: string },
): boolean {
  const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
  return (
    entry.name.startsWith('.') ||
    layout.excludedGlobs.some((glob) => path.posix.matchesGlob(`${relative}/x`, glob))
  );
}

export function codeFilesUnder(
  directories: readonly string[],
  layout: WalkedLayout,
  projectRoot: string,
): string[] {
  const walked = { layout, projectRoot };
  return directories
    .flatMap((dir) => [
      ...projectFilesUnder(dir, {
        includeIgnored: true,
        skipDirectory: (absolute, entry) => isSkippedDirectory(absolute, entry, walked),
      }),
    ])
    .filter((file) => isCodeFile(file));
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function walkRules({ projectRoot, layout }: { projectRoot: string; layout: WalkedLayout }): {
  isDirectory: (directory: string) => boolean;
  isFile: (file: string) => boolean;
} {
  const root = path.resolve(projectRoot);
  const walked = { layout, projectRoot: root };
  const plain = new Map<string, boolean>();
  function isPlainDirectory(directory: string): boolean {
    if (!plain.has(directory)) {
      const entry = lstatSync(directory, { throwIfNoEntry: false });
      const skipped = isSkippedDirectory(directory, { name: path.basename(directory) }, walked);
      plain.set(directory, entry?.isDirectory() === true && !skipped);
    }
    return plain.get(directory) === true;
  }
  function isWalkedDirectory(directory: string): boolean {
    const segments = path.relative(root, directory).split(path.sep).filter(Boolean);
    return (
      isInside(root, directory) &&
      segments
        .map((_, index) => path.join(root, ...segments.slice(0, index + 1)))
        .every((ancestor) => isPlainDirectory(ancestor))
    );
  }
  return {
    isDirectory: (directory) => isWalkedDirectory(path.resolve(directory)),
    isFile: (file) =>
      isCodeFile(file) &&
      lstatSync(file, { throwIfNoEntry: false })?.isFile() === true &&
      isWalkedDirectory(path.dirname(path.resolve(file))),
  };
}

function compilerOptions({
  parsed,
  packages,
  projectRoot,
  layout,
}: {
  parsed: TypeScript.ParsedCommandLine;
  packages: readonly PackageEntry[];
  projectRoot: string;
  layout: ProgramLayout;
}): TypeScript.CompilerOptions {
  return {
    ...parsed.options,
    noEmit: true,
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    types: [],
    jsx: parsed.options.jsx ?? ts.JsxEmit.ReactJSX,
    paths: { ...workspacePaths(packages, layout), ...parsed.options.paths },
    pathsBasePath: parsed.options['pathsBasePath'] ?? projectRoot,
  };
}

export type ProgramRequest = {
  projectRoot: string;
  configPath: string;
  packagesInfo: PackagesInfo;
  layout: ProgramLayout;
};

const reusablePrograms = new Map<string, TypeScript.Program>();

function programKey({ projectRoot, configPath, packagesInfo }: ProgramRequest): string {
  return JSON.stringify([
    projectRoot,
    readFileSync(configPath, 'utf8'),
    packagesInfo.packages.map(({ dir }) => dir),
  ]);
}

export type ProgramInputs = {
  readonly parsed: TypeScript.ParsedCommandLine;
  readonly options: TypeScript.CompilerOptions;
  readonly rootNames: readonly string[];
};

export function projectProgramInputs({
  projectRoot,
  configPath,
  packagesInfo,
  layout,
}: ProgramRequest): ProgramInputs {
  const parsed = parseConfig(configPath, projectRoot);
  const options = compilerOptions({ parsed, packages: packagesInfo.packages, projectRoot, layout });
  const siblings = packagesInfo.packages.filter(
    ({ dir }) => dir !== projectRoot && !projectRoot.startsWith(`${dir}${path.sep}`),
  );
  const siblingFiles = codeFilesUnder(
    siblings.map(({ dir }) => dir),
    layout,
    projectRoot,
  );
  const rootNames = new Set([
    ...parsed.fileNames,
    ...rootConfigsAndScripts(projectRoot, layout),
    ...relevantSiblingFiles({
      projectRoot,
      files: siblingFiles,
      packages: packagesInfo.packages,
      options,
    }),
  ]);
  return { parsed, options, rootNames: [...rootNames] };
}

function builtProgram(request: ProgramRequest): TypeScript.Program {
  const { options, rootNames } = projectProgramInputs(request);
  return ts.createProgram({ rootNames: [...rootNames], options });
}

function takenOrBuilt(
  reusable: Map<string, TypeScript.Program>,
  request: ProgramRequest,
): TypeScript.Program {
  const key = programKey(request);
  const kept = reusable.get(key);
  reusable.clear();
  if (kept !== undefined) {
    return kept;
  }
  const program = builtProgram(request);
  reusable.set(key, program);
  return program;
}

export function createProjectProgram(request: ProgramRequest): TypeScript.Program {
  return takenOrBuilt(reusablePrograms, request);
}
