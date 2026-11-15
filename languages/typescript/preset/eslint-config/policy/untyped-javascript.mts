import type { Linter } from 'eslint';
import { createRequire } from 'node:module';
import path from 'node:path';
import type TypeScript from 'typescript';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../shared/project-files/project-files.mjs';
import { selectTypeScriptApi as untypedSelectTypeScriptApi } from '../../../typescript-api/api-selection.mjs';
import {
  checksJavascript as untypedChecksJavascript,
  projectTsconfigs as untypedProjectTsconfigs,
  readJsonc as untypedReadJsonc,
  referencedTsconfigs as untypedReferencedTsconfigs,
} from '../../modules/tsconfig-files.mjs';

export type JavascriptLayout = {
  readonly javascript: boolean;
  readonly typescriptProject?: string | undefined;
  readonly isExcluded: (file: string) => boolean;
  readonly projectCodeFiles?: (projectRoot: string) => readonly string[];
};

type ProjectFileOptions = {
  readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
};

type ConfigCoverage = {
  readonly directory: string;
  readonly checked: boolean;
  readonly files: ReadonlySet<string>;
};

const projectFilesUnder: (root: string, options: ProjectFileOptions) => string[] =
  untypedProjectFilesUnder;
const selectTypeScriptApi: () => { readonly file: string } = untypedSelectTypeScriptApi;
const checksJavascript: (configFile: string) => boolean = untypedChecksJavascript;
const projectTsconfigs: (
  projectRoot: string,
  files: readonly string[],
  hiddenFile: (file: string) => boolean,
) => string[] = untypedProjectTsconfigs;
const readJsonc: (file: string) => unknown = untypedReadJsonc;
const referencedTsconfigs: (configFile: string) => string[] = untypedReferencedTsconfigs;

function isTypeScriptApi(value: unknown): value is typeof TypeScript {
  return typeof value === 'object' && value !== null && 'parseJsonConfigFileContent' in value;
}

function loadTypeScript(): typeof TypeScript {
  const loaded: unknown = createRequire(import.meta.url)(selectTypeScriptApi().file);
  if (!isTypeScriptApi(loaded)) {
    throw new TypeError('The selected TypeScript API does not load.');
  }
  return loaded;
}

export const UNSAFE_ANY_RULES = [
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/restrict-template-expressions',
  '@typescript-eslint/restrict-plus-operands',
];

const JAVASCRIPT_FILES = ['**/*.{js,mjs,cjs,jsx}'];
const JAVASCRIPT_FILE = /\.(?:jsx?|[cm]js)$/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
const GLOB_CHARACTER = /[!*?{}[\]()+@]/gu;

function selectedConfigs(file: string): string[] {
  const found = new Set([file]);
  for (const current of found) {
    for (const reference of referencedTsconfigs(current)) {
      found.add(reference);
    }
  }
  return [...found];
}

function configFiles(
  projectRoot: string,
  tsconfigFile: string,
  layout: JavascriptLayout,
): string[] {
  if (layout.typescriptProject !== undefined) {
    return selectedConfigs(tsconfigFile);
  }
  const files = projectFilesUnder(projectRoot, {
    skipDirectory: (_absolute, entry) => SKIPPED_DIRECTORIES.has(entry.name),
  }).map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
  const configs = projectTsconfigs(projectRoot, files, layout.isExcluded);
  return [...new Set([tsconfigFile, ...configs.map((file) => path.resolve(projectRoot, file))])];
}

function configCoverage(file: string, typescript: typeof TypeScript): ConfigCoverage {
  const directory = path.dirname(file);
  const parsed = typescript.parseJsonConfigFileContent(
    readJsonc(file) ?? {},
    typescript.sys,
    directory,
    { allowJs: true },
    file,
  );
  const checked = parsed.options.checkJs === true;
  const files = checked
    ? typescript
        .createProgram({ rootNames: parsed.fileNames, options: parsed.options })
        .getSourceFiles()
        .map((source) => source.fileName)
    : parsed.fileNames;
  return { directory, checked, files: new Set(files.map((name) => path.resolve(name))) };
}

function checkedFiles(
  { projectRoot, tsconfigFile, layout }: JavascriptOptions,
  projectCodeFiles: (projectRoot: string) => readonly string[],
): string[] {
  const files = projectCodeFiles(projectRoot).filter((file) => JAVASCRIPT_FILE.test(file));
  if (files.length === 0) {
    return [];
  }
  const typescript = loadTypeScript();
  const configs = configFiles(projectRoot, tsconfigFile, layout)
    .map((file) => configCoverage(file, typescript))
    .toSorted((left, right) => right.directory.length - left.directory.length);
  return files
    .filter(
      (file) =>
        configs.find((config) => config.files.has(path.resolve(projectRoot, file)))?.checked,
    )
    .map((file) => file.replace(GLOB_CHARACTER, '\\$&'));
}

type JavascriptOptions = {
  readonly tsconfigFile: string;
  readonly layout: JavascriptLayout;
  readonly projectRoot: string;
};

export function untypedJavascriptConfig({
  tsconfigFile,
  layout,
  projectRoot = path.dirname(tsconfigFile),
}: Omit<JavascriptOptions, 'projectRoot'> & { readonly projectRoot?: string }): Linter.Config[] {
  if (layout.javascript) {
    return [];
  }
  const ignores =
    typeof layout.projectCodeFiles === 'function'
      ? checkedFiles({ projectRoot, tsconfigFile, layout }, layout.projectCodeFiles)
      : undefined;
  if (ignores === undefined && checksJavascript(tsconfigFile)) {
    return [];
  }
  return [
    {
      files: JAVASCRIPT_FILES,
      ...(ignores === undefined || ignores.length === 0 ? {} : { ignores }),
      rules: Object.fromEntries(UNSAFE_ANY_RULES.map((rule) => [rule, 'off'])),
    },
  ];
}
