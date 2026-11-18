export type PatternMatcher = (file: string, pattern: string) => boolean;
export type SourceSet = { readonly set: string; readonly roots: readonly string[] };
export type GradleStatement = { readonly path: string[]; readonly text: string };
type FilterKey = { readonly action: string; readonly kind: string; readonly group: string };
export type TaskFilter =
  | (FilterKey & { readonly disabled: true; readonly text?: undefined })
  | (FilterKey & { readonly disabled?: undefined; readonly text: string });
export type RootsEntry = {
  readonly type: 'roots';
  readonly key: string;
  readonly file: string;
  readonly label: string;
  readonly set: string;
  readonly roots: string[];
};
export type FilterEntry = {
  readonly type: 'excludes' | 'includes';
  readonly key: string;
  readonly file: string;
  readonly label: string;
  readonly patterns: string[];
  readonly covers: PatternMatcher | undefined;
  readonly inScope?: (file: string) => boolean;
  readonly admits?: PatternMatcher | undefined;
};
export type SourceEntry = RootsEntry | FilterEntry;
export type FileReader = (file: string) => string | undefined;
