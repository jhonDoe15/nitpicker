export type PackageEntry = {
  readonly dir: string;
  readonly name: string;
  readonly manifest: unknown;
};

type PublishableEntry = PackageEntry & { readonly published: boolean };

export type PackagesInfo = {
  readonly packages: readonly PublishableEntry[];
  packageOf(file: string): PublishableEntry | undefined;
};

export type ProgramLayout = {
  readonly excludedGlobs: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly isExcluded: (relativePath: string) => boolean;
  readonly isTestFile: (relativePath: string) => boolean;
  readonly isTestFixture: (file: string, name?: string) => boolean;
};

export type EntryLayout = {
  readonly excludedGlobs: readonly string[];
  readonly sourceRoots: readonly string[];
};
