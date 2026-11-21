export type DirectoryEntry = { readonly name: string; isDirectory(): boolean };

export type SkipDirectory = (absolute: string, entry: DirectoryEntry) => boolean;

type OptionFlags<Name extends string> = Partial<Readonly<Record<Name, boolean | undefined>>>;

export type ListingOptions = { readonly skipDirectory?: SkipDirectory } & OptionFlags<
  'includeIgnored' | 'includeLinks'
>;

export type WalkOptions = {
  readonly skipDirectory: SkipDirectory;
  readonly registered?: ReadonlySet<string> | undefined;
} & OptionFlags<'includeLinks'>;

export type ListedEntry = { readonly file: string; readonly kind: string | undefined };

export type TreeListing = {
  readonly files: string[];
  readonly links: Set<string>;
  readonly submodules: Set<string>;
  readonly gitPaths: string[];
};

export type TreeSources = {
  readonly load: (top: string) => TreeListing | undefined;
  readonly relist: (top: string, folder: string) => ListedEntry[] | undefined;
};

export type GitResult = { readonly status: number; readonly stdout: string };

export type Repository = { readonly top: string; readonly tree: TreeListing };
