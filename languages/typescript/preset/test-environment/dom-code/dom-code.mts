import path from 'node:path';
import globals from 'globals';
import picomatch from 'picomatch';
import type { Linter } from 'eslint';
import { restrictedBrowserGlobals as untypedRestrictedBrowserGlobals } from '../../eslint-config/react/react-rules.mjs';
import { productionScope as untypedProductionScope } from '../../eslint-config/scope-support.mjs';
import { domainGlobsFor } from '../../eslint-config/strict/strict-domain.mts';
import { escapedGlob as untypedEscapedGlob } from '../../test-runner/test-files/test-file-patterns.mjs';
import { isDomEnvironment as untypedIsDomEnvironment } from '../environments.mjs';
import {
  hasDomDirective as untypedHasDomDirective,
  projectText as untypedProjectText,
} from './dom-tests.mjs';
import type { EnvironmentScope, Environments } from '../typed/environment-types.mts';

type DomLayout = {
  readonly sourceRoots: readonly string[];
  readonly excludedGlobs: readonly string[];
  projectCodeFiles(projectRoot: string): readonly string[];
  isRunnableTestFile(file: string): boolean;
  isSourceFile(file: string): boolean;
};

type ProjectFiles = { readonly projectRoot: string; readonly files: readonly string[] };

const restrictedBrowserGlobals: Linter.RuleEntry = [
  'error',
  ...untypedRestrictedBrowserGlobals.slice(1),
];
const productionScope: (layout: DomLayout) => { readonly ignores: readonly string[] } =
  untypedProductionScope;
const escapedGlob: (file: string) => string = untypedEscapedGlob;
const isDomEnvironment: (environment: string | undefined) => boolean = untypedIsDomEnvironment;
const hasDomDirective: (projectRoot: string, file: string) => boolean = untypedHasDomDirective;
const projectText: (projectRoot: string, file: string) => string = untypedProjectText;

const RELATIVE_IMPORT = /\b(?:from|import|require)[\s(]*['"](?<specifier>\.{1,2}\/[^'"\n]*)['"]/gu;
const SCRIPT_EXTENSION = /\.(?:[cm]?js|jsx)$/u;
const RESOLVED_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

function resolvedImport(
  known: ReadonlySet<string>,
  from: string,
  specifier: string,
): string | undefined {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const stem = target.replace(SCRIPT_EXTENSION, '');
  const candidates = [
    target,
    ...RESOLVED_EXTENSIONS.map((extension) => `${stem}.${extension}`),
    ...RESOLVED_EXTENSIONS.map((extension) => `${target}/index.${extension}`),
  ];
  return candidates.find((candidate) => known.has(candidate));
}

function importedFiles(projectRoot: string, file: string, known: ReadonlySet<string>): string[] {
  const specifiers = [...projectText(projectRoot, file).matchAll(RELATIVE_IMPORT)].flatMap(
    ({ groups }) => (groups?.['specifier'] === undefined ? [] : [groups['specifier']]),
  );
  return specifiers.flatMap((specifier) => {
    const imported = resolvedImport(known, file, specifier);
    return imported === undefined ? [] : [imported];
  });
}

function importClosure(
  projectRoot: string,
  starts: readonly string[],
  known: ReadonlySet<string>,
): string[] {
  const seen = new Set(starts);
  const pending = [...starts];
  for (const file of pending) {
    const fresh = importedFiles(projectRoot, file, known).filter((imported) => !seen.has(imported));
    for (const imported of fresh) {
      seen.add(imported);
      pending.push(imported);
    }
  }
  return [...seen];
}

function domScopeMatchers(scopes: readonly EnvironmentScope[]): ((file: string) => boolean)[] {
  return scopes
    .filter((scope) => isDomEnvironment(scope.environment))
    .map((scope) => picomatch([...scope.files], { dot: true, ignore: [...(scope.ignores ?? [])] }));
}

function domTestFiles(
  layout: DomLayout,
  { environment, scopes }: Environments,
  { projectRoot, files }: ProjectFiles,
): string[] {
  const tests = files.filter((file) => layout.isRunnableTestFile(file));
  if (isDomEnvironment(environment)) {
    return tests;
  }
  const matchers = domScopeMatchers(scopes);
  return tests.filter(
    (file) => matchers.some((matches) => matches(file)) || hasDomDirective(projectRoot, file),
  );
}

export function domTestedProductionFiles(
  layout: DomLayout,
  environments: Environments,
  projectRoot: string,
): string[] {
  const files = layout.projectCodeFiles(projectRoot);
  const tests = domTestFiles(layout, environments, { projectRoot, files });
  if (tests.length === 0) {
    return [];
  }
  const reached = importClosure(projectRoot, tests, new Set(files));
  return reached.filter((file) => layout.isSourceFile(file));
}

export function domProductionConfigFor(
  layout: DomLayout,
  environments: Environments,
  projectRoot: string,
): Linter.Config[] {
  const production = domTestedProductionFiles(layout, environments, projectRoot).map(escapedGlob);
  if (production.length === 0) {
    return [];
  }
  return [
    { files: production, languageOptions: { globals: globals.browser } },
    {
      files: [...production, ...productionScope(layout).ignores],
      ignores: [...layout.excludedGlobs, ...domainGlobsFor(layout.sourceRoots)],
      rules: { 'no-restricted-globals': restrictedBrowserGlobals },
    },
  ];
}
