import { createRequire } from 'node:module';
import path from 'node:path';
import { projectFilesUnder } from '../../../../../shared/project-files/project-files.mjs';
import { selectTypeScriptApi } from '../../../typescript-api/api-selection.mjs';
import {
  checksJavascript,
  projectTsconfigs,
  readJsonc,
  referencedTsconfigs,
} from '../../modules/tsconfig-files.mjs';

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

function selectedConfigs(file) {
  const found = new Set([file]);
  for (const current of found) {
    for (const reference of referencedTsconfigs(current)) {
      found.add(reference);
    }
  }
  return [...found];
}

function configFiles(projectRoot, tsconfigFile, layout) {
  if (layout.typescriptProject !== undefined) {
    return selectedConfigs(tsconfigFile);
  }
  const files = projectFilesUnder(projectRoot, {
    skipDirectory: (_absolute, entry) => SKIPPED_DIRECTORIES.has(entry.name),
  }).map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
  const configs = projectTsconfigs(projectRoot, files, layout.isExcluded);
  return [...new Set([tsconfigFile, ...configs.map((file) => path.resolve(projectRoot, file))])];
}

function configCoverage(file, typescript) {
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

function checkedFiles({ projectRoot, tsconfigFile, layout }) {
  const files = layout.projectCodeFiles(projectRoot).filter((file) => JAVASCRIPT_FILE.test(file));
  if (files.length === 0) {
    return [];
  }
  const typescript = createRequire(import.meta.url)(selectTypeScriptApi().file);
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

export function untypedJavascriptConfig({
  tsconfigFile,
  layout,
  projectRoot = path.dirname(tsconfigFile),
}) {
  if (layout.javascript) {
    return [];
  }
  const ignores =
    typeof layout.projectCodeFiles === 'function'
      ? checkedFiles({ projectRoot, tsconfigFile, layout })
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
