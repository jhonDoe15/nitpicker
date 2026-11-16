export type NamedFile = { readonly path: string };

export type PlanFile = { readonly path: string; readonly text: string };

export type PlanEdit = {
  readonly type: string;
  readonly path: string;
  readonly start?: number;
  readonly end?: number;
  readonly text?: string;
  readonly to?: string;
};

export type ReplaceEdit = {
  readonly type: 'replace';
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

type RecipeFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};

export type RecipeFix = { readonly finding: RecipeFinding; readonly edits: readonly ReplaceEdit[] };

export type Planned = { readonly fixes: readonly RecipeFix[]; readonly notes?: readonly string[] };

export type ScriptPlanned = {
  readonly fixes: readonly ScriptFix[];
  readonly notes?: readonly string[];
};

export type DocComment = {
  readonly span: readonly [number, number];
  readonly only: boolean;
  readonly line: number;
  readonly [field: string]: unknown;
};

export type DependencyFinding = {
  readonly rule: string;
  readonly identity: string;
  readonly path: string;
  readonly test: boolean;
  readonly location?: { readonly line?: number | undefined };
  readonly [field: string]: unknown;
};

export type DependencyInputs = {
  readonly findings: readonly DependencyFinding[];
  readonly versions: Readonly<Record<string, unknown>>;
};

export type UnusedIgnore = { readonly line: number | undefined; readonly message: string };

export type RecipeInputs = {
  readonly isExcepted?: (rule: string, name: string) => boolean;
  readonly pythonDocstrings?: Readonly<Record<string, readonly DocComment[]>>;
  readonly pythonDependencies?: DependencyInputs;
  readonly pythonUnusedIgnores?: Readonly<
    Record<string, { readonly text: string | undefined; readonly ignores: readonly UnusedIgnore[] }>
  >;
  readonly [field: string]: unknown;
};

export type PlanContext = {
  readonly files: readonly PlanFile[];
  readonly read: (name: string) => string | undefined;
  readonly projectRoot: string;
  readonly accepts: (name: string) => boolean;
  readonly inputs: RecipeInputs;
};

type RecipeOf<Output> = {
  readonly id: string;
  readonly rules: readonly { readonly tool: string; readonly rule: string }[];
  readonly presets: readonly string[];
  readonly scope: string;
  readonly safety: string;
  readonly plan: (context: PlanContext) => Output;
};

export type FileRecipe = RecipeOf<Planned>;
export type ScriptRecipe = RecipeOf<ScriptPlanned>;

export type ProjectRecipe = FileRecipe & { readonly accepts: (name: string) => boolean };

export type TomlKey = {
  readonly key: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  readonly multiline: boolean;
  readonly source: string;
  readonly last: number;
};

export type TomlSection = {
  readonly name: string;
  readonly start: number;
  readonly bodyStart: number;
  readonly keys: TomlKey[];
};

export type TomlElement = {
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  readonly value: string;
};

export type TomlArray = {
  readonly open: number;
  readonly close: number;
  readonly elements: TomlElement[];
};

export type TextEdit = { readonly start: number; readonly end: number; readonly text: string };

export type DeclaredEntry = {
  readonly kind: 'array' | 'table';
  readonly group: string;
  readonly key: TomlKey;
  readonly index?: number;
  readonly normalized: string;
  readonly raw: string;
};

type ScriptFix = { readonly finding: RecipeFinding; readonly edits: readonly PlanEdit[] };
export type Decline = {
  readonly rule: string;
  readonly path: string;
  readonly line: number;
  readonly reason: string;
};
export type ScriptResult = { readonly fixes: readonly ScriptFix[]; readonly declines: Decline[] };
