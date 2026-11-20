import type { FixEdit, FixEntry, PlannedFinding, RecipeEdit, Snapshot } from './edit-types.mts';

export type { FixEdit, RecipeEdit };

export type FixFile = { readonly path: string };

export type FixWriter = {
  readonly projectRoot: string;
  readonly apply: <Entry extends FixEntry>(
    snapshot: Snapshot,
    entries: readonly Entry[],
    tool?: string,
  ) => {
    readonly applied: readonly Entry[];
    readonly changedMeanwhile: string[];
    readonly errors: string[];
  };
};

export type FixInvocation = {
  readonly operation?: string;
  readonly acceptedStatuses?: readonly number[];
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
  readonly input: string | undefined;
  readonly environment: NodeJS.ProcessEnv | undefined;
  readonly shell?: true;
  readonly timeout?: number;
};

export type PlannedFix = {
  readonly recipe?: string;
  readonly tool?: string | undefined;
  readonly safety: string;
  readonly finding?: PlannedFinding | undefined;
  readonly alsoFindings?: readonly PlannedFinding[];
  readonly files: readonly string[];
};

export type DryRunPlan = { readonly patch: Buffer; readonly fixes: readonly PlannedFix[] };

export type FixStep = {
  readonly toolErrors: readonly unknown[];
  readonly notes: readonly string[];
  readonly fixedFindings?: readonly string[];
};

export type FixOutcome = {
  readonly fixedFiles: readonly string[];
  readonly toolErrors: readonly unknown[];
  readonly fixedFindings?: readonly string[];
  readonly notes?: readonly string[];
  readonly dryRun?: DryRunPlan;
};

export type FixSettings = {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly allFiles: boolean;
  readonly dryRun: boolean;
  readonly config: unknown;
  readonly headPolicy: unknown;
  readonly selectedRules: readonly string[];
  readonly executeFixCommand: (invocation: FixInvocation) => unknown;
  readonly writer: FixWriter;
  readonly recipes: unknown;
};

export type RuleRef = { readonly tool: string; readonly rule: string };

export type RecipeSource = FixFile & { readonly text: string };

type RecipeFinding = RuleRef & { readonly path: string; readonly line: number };

export type RecipeFix = {
  readonly finding: RecipeFinding;
  readonly stays?: string;
  readonly note?: string;
  readonly alsoFixes?: readonly RecipeFinding[];
  readonly edits: readonly RecipeEdit[];
};

export type RecipePlanInput = {
  readonly files: readonly RecipeSource[];
  readonly read?: (name: string) => string | undefined;
  readonly projectRoot?: string;
  readonly accepts?: (name: string) => boolean;
  readonly inputs?: Readonly<Record<string, unknown>>;
};

export type RecipePlan = {
  readonly fixes: readonly RecipeFix[];
  readonly notes?: readonly string[];
};

export type FixRecipe = {
  readonly id: string;
  readonly rules: readonly RuleRef[];
  readonly presets: readonly string[];
  readonly scope: 'file' | 'project';
  readonly safety: string;
  readonly accepts?: (name: string) => boolean;
  readonly plan: (input: RecipePlanInput) => RecipePlan;
};

export type RuleMatcher = RuleRef & {
  readonly pattern?: string;
  readonly findingTools?: readonly string[];
  readonly fixableIn?: readonly string[];
  readonly suggestedIn?: readonly string[];
};

export type PresetRule = RuleRef & {
  readonly presets: readonly string[];
  readonly safety?: string;
};

export type RecipeListing = {
  readonly id?: string;
  readonly presets: readonly string[];
  readonly rules: readonly RuleRef[];
  readonly safety: string;
};

export type FixStatusSources = {
  readonly recipes: readonly RecipeListing[];
  readonly formatters: readonly PresetRule[];
  readonly selected?: readonly PresetRule[];
};

export function concatenated(...lists: readonly (readonly unknown[])[]): unknown[] {
  return lists.flat();
}

export type Tools = Readonly<Record<string, { readonly precedence?: string[] }>>;

export type Precedence = Record<string, string[] | undefined>;
