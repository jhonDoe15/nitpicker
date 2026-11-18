import { hunkEdit } from '../patch/hunk-edits.mts';
import { ownChecksOf, ownRule } from '../own/own-checks.mts';
import { REVIEW_CHECKS, ruleOf, SAFE_CHECKS } from '../checks/error-prone-checks.mts';
import { twinsOf } from '../checks/twin-rules.mts';
import type {
  FixRecipe,
  RecipeEdit,
  RecipeFix,
  RecipeSource,
  RuleRef,
} from '../../../../../core/fix/typed/fix-types.mts';
import type { LabeledHunk } from '../patch/select-hunks.mts';

export type PatchEntries = ReadonlyMap<string, readonly LabeledHunk[]>;
type Placed = { readonly line: number; readonly edit: RecipeEdit };
type Labels = { readonly names: ReadonlySet<string>; readonly ruleFor: (check: string) => RuleRef };
type RecipeSpec = {
  readonly id: string;
  readonly checks: readonly string[];
  readonly safety: string;
  readonly entries: PatchEntries;
  readonly ruleFor?: (check: string) => RuleRef;
};

const PRESETS = ['java', 'kotlin'];

function editOf(text: string, name: string, { hunk, line }: LabeledHunk): Placed | undefined {
  const edit = hunkEdit(text, hunk);
  return edit === undefined
    ? undefined
    : {
        line: line ?? edit.line,
        edit: { type: 'replace', path: name, start: edit.start, end: edit.end, text: edit.text },
      };
}

function fileFixes(
  { path: name, text }: RecipeSource,
  hunks: readonly LabeledHunk[],
  { names, ruleFor }: Labels,
): RecipeFix[] {
  const found = new Map<string, RecipeFix>();
  for (const entry of hunks.filter(({ label }) => names.has(label))) {
    const placed = editOf(text, name, entry);
    if (placed !== undefined) {
      const key = `${entry.label}:${String(placed.line)}`;
      const at = { path: name, line: placed.line };
      const twins = twinsOf(entry.label).map((rule) => ({ ...rule, ...at }));
      found.set(key, {
        finding: { ...ruleFor(entry.label), ...at },
        ...(twins.length === 0 ? {} : { alsoFixes: twins }),
        edits: [...(found.get(key)?.edits ?? []), placed.edit],
      });
    }
  }
  return [...found.values()];
}

function fixesOf(
  entries: PatchEntries,
  files: readonly RecipeSource[],
  labels: Labels,
): RecipeFix[] {
  const sources = new Map(files.map((source) => [source.path, source]));
  return [...entries].flatMap(([name, hunks]) => {
    const source = sources.get(name);
    return source === undefined ? [] : fileFixes(source, hunks, labels);
  });
}

function recipeOf({ id, checks, safety, entries, ruleFor = ruleOf }: RecipeSpec): FixRecipe {
  const names = new Set(checks);
  return {
    id,
    rules: checks.flatMap((check) => [ruleFor(check), ...twinsOf(check)]),
    presets: PRESETS,
    scope: 'file',
    safety,
    plan({ files }) {
      return { fixes: fixesOf(entries, files, { names, ruleFor }) };
    },
  };
}

function ownRecipe(id: string, safety: string, entries: PatchEntries): FixRecipe {
  return recipeOf({ id, checks: ownChecksOf(safety), safety, entries, ruleFor: ownRule });
}

export function errorProneRecipes(entries: PatchEntries): FixRecipe[] {
  return [
    recipeOf({ id: 'java-error-prone-safe', checks: SAFE_CHECKS, safety: 'safe', entries }),
    recipeOf({ id: 'java-error-prone-review', checks: REVIEW_CHECKS, safety: 'review', entries }),
    ownRecipe('java-source-safe', 'safe', entries),
    ownRecipe('java-source-review', 'review', entries),
  ];
}
