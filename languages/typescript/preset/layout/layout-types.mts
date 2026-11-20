export type LayoutTestFiles = {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly includeRegexes: readonly string[];
  readonly excludeRegexes: readonly string[];
};

export type RootsInput = {
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
};

export type FilePatternsInput = RootsInput & {
  readonly extensions: readonly string[];
  readonly colocatedTests: boolean;
};

export type FilePatterns = {
  readonly testPattern: RegExp;
  readonly sourcePattern: RegExp;
  readonly codePattern: RegExp;
};

export type GlobsInput = RootsInput & {
  readonly javascript: boolean;
  readonly extensionGlob: string;
  readonly colocatedTests: boolean;
  readonly testFiles: LayoutTestFiles;
};

export type LayoutGlobs = {
  readonly testSupportGlobs: string[];
  readonly sourceGlobs: string[];
  readonly testGlobs: string[];
  readonly runnerSourceTestGlobs: string[];
  readonly runnableTestGlobs: string[];
  readonly sourceTestDirectoryGlobs: string[];
  readonly unitTestGlobs: string[];
  readonly graphRoots: string[];
  readonly graphIncludeOnly: string;
};

export type CodeFileLayout = {
  isGeneratedPath(file: string): boolean;
  isSourceFile(file: string): boolean;
  isTestFile(file: string): boolean;
  isExcluded(file: string): boolean;
};
