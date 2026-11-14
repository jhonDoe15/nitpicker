import type TypeScript from 'typescript';

export type FixLayout = {
  readonly javascript: boolean;
  readonly colocatedTests: boolean;
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly sourceGlobs: readonly string[];
  readonly excludedGlobs: readonly string[];
  readonly unitTestGlobs: readonly string[];
  readonly isSourceFile: (name: string) => boolean;
  readonly isTestFile: (name: string) => boolean;
  readonly isExcluded: (name: string) => boolean;
};

export type FixHeadPolicy = {
  readonly react?: object;
  readonly conventions?: object;
  readonly conventionPins?: object;
};

export type FixInputs = {
  readonly layout?: FixLayout;
  readonly headPolicy?: FixHeadPolicy;
  readonly isExcepted?: (ruleId: string, name: string) => boolean;
};

export type FixContext = {
  readonly projectRoot: string;
  readonly files: readonly { readonly path: string }[];
  readonly inputs?: FixInputs;
  readonly read: (name: string) => string | undefined;
  readonly accepts: (name: string) => boolean;
};

export type ReplaceEdit = {
  readonly type: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export type ProjectEdit =
  | ReplaceEdit
  | { readonly type: string; readonly from: string; readonly to: string }
  | { readonly type: string; readonly path: string }
  | { readonly type: string; readonly path: string; readonly text: string };

export type Planned<Edit = ProjectEdit> =
  | { readonly edits: readonly Edit[]; readonly declined?: undefined }
  | { readonly declined: string; readonly edits?: undefined };

export type Project = {
  readonly ts: typeof TypeScript;
  readonly projectRoot: string;
  readonly service: TypeScript.LanguageService;
  readonly program: TypeScript.Program;
  readonly names: readonly string[];
  readonly absolute: (name: string) => string;
  readonly read: (name: string) => string | undefined;
  readonly nameOf: (file: string) => string | undefined;
  readonly has: (name: string) => boolean;
  readonly sourceFile: (name: string) => TypeScript.SourceFile | undefined;
  readonly resolve: (specifier: string, from: string) => string | undefined;
  readonly lineOf: (name: string, offset: number) => number;
  readonly dispose: () => void;
};

export type LintMessage = {
  readonly messageId: string | undefined;
  readonly message: string;
  readonly line: number;
  readonly start: number;
  readonly end: number | undefined;
};

type ProjectFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};

export type ProjectFix = {
  readonly finding: ProjectFinding;
  readonly edits: readonly ProjectEdit[];
};

type ProjectPlan = {
  readonly fixes: readonly ProjectFix[];
  readonly notes: readonly string[];
};

export type ProjectRecipe = {
  readonly id: string;
  readonly rules: readonly { readonly tool: string; readonly rule: string }[];
  readonly presets: readonly string[];
  readonly scope: 'project';
  readonly safety: string;
  readonly plan: (context: FixContext) => ProjectPlan;
};
