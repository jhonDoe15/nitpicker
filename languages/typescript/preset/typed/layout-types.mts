import type { FilePatterns, LayoutGlobs, LayoutTestFiles } from '../layout/layout-types.mts';

export type LayoutOptions = {
  readonly sourceRoots?: readonly string[];
  readonly testRoots?: readonly string[];
  readonly colocatedTests?: unknown;
  readonly excludedGlobs?: readonly string[];
};

export type LayoutPolicy = {
  readonly preset?: string | undefined;
  readonly layout?: LayoutOptions | undefined;
  readonly exclude?: readonly string[] | undefined;
  readonly generatedFiles?: readonly string[] | undefined;
  readonly duplicates?: { readonly skippedFolders?: readonly string[] | undefined } | undefined;
  readonly tools?:
    | {
        readonly tests?:
          | {
              readonly testFiles?: LayoutTestFiles | undefined;
              readonly runner?: string | undefined;
              readonly detectedRunner?: string | undefined;
            }
          | undefined;
        readonly typescript?: TypescriptSettings | undefined;
      }
    | undefined;
};

type TypescriptSettings = {
  readonly project?: string | undefined;
  readonly [field: string]: unknown;
};

export type ResolveOptions = {
  readonly javascript?: true;
  readonly generatedFiles?: readonly string[] | undefined;
  readonly testFiles?: LayoutTestFiles;
};

export type LayoutClassifiers = {
  isExcluded: (file: string) => boolean;
  isTestFile: (file: string) => boolean;
  isFixturePath: (file: string) => boolean;
  isGeneratedPath: (file: string) => boolean;
  isTestPath: (file: string) => boolean;
  isRunnableTestFile: (file: string) => boolean;
  isRunnerTestFile: (file: string) => boolean;
  isSourceFile: (file: string) => boolean;
  isSourceUnderRoot: (file: string, root: string) => boolean;
  sourceRootOf: (file: string) => string | undefined;
  sourcePathOf: (file: string) => string | undefined;
  isTestFixture: (file: string, name?: string) => boolean;
};

export type ResolvedLayout = LayoutGlobs &
  LayoutClassifiers & {
    testFiles: LayoutTestFiles;
    javascript: boolean;
    colocatedTests: boolean;
    extensions: readonly string[];
    entryExtensions: readonly string[];
    formatExtensions: readonly string[];
    sourceRoots: string[];
    sourceRoot: string;
    testRoots: string[];
    exclude: readonly string[];
    excludedGlobs: string[];
    runtimeExcludedGlobs: string[];
    hiddenGlobs: string[];
    executedTestRoots: readonly string[];
    endToEndGlobs: string[];
    isEndToEndTest: (file: string) => boolean;
    excludePattern: string | undefined;
    generatedFilePattern: string | undefined;
    projectCodeFiles: (projectRoot: string, roots?: readonly string[]) => string[];
  };

export type PolicyLayout = ResolvedLayout & {
  duplicateSkippedFolders: readonly string[] | undefined;
  typescriptProject: string | undefined;
  typescriptSettings: TypescriptSettings | undefined;
};

export type ExcludedGlobs = {
  excludedGlobs: string[];
  hiddenGlobs: string[];
  excludePattern: string | undefined;
};

export type ExtensionFacts = {
  extensions: string[];
  entryExtensions: string[];
  formatExtensions: string[];
};

export type ClassifierInput = {
  sourceRoots: readonly string[];
  testRoots: readonly string[];
  exclude: readonly string[];
  patterns: FilePatterns;
  generatedFiles: readonly string[];
  testFiles: LayoutTestFiles;
};
