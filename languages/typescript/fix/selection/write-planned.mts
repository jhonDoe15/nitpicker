import type { FixSettings } from '../../../../core/fix/typed/fix-types.mts';
import {
  withFixedLineEndingsOf,
  writeTexts,
  type Bytes,
} from '../../../../core/fix/typed/fix-views.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';
import { applySuggestions } from '../suggestions/apply-suggestions.mts';
import { suggestionName, type LintMessage } from '../suggestions/typed/suggestion-views.mts';
import { selectedEslintRules, selectedOutput } from './selected-fixes.mts';

export const TOOL = 'eslint --fix';

const ANALYZER = 'eslint-lint';
const SUGGESTION_RECIPE = 'eslint-suggestion';
const REVIEW = 'review';

type PlanSettings = Pick<FixSettings, 'selectedRules' | 'writer'>;
export type Reported = {
  readonly name: string;
  readonly output: unknown;
  readonly messages: readonly LintMessage[];
  readonly fatal: boolean;
};
type Applied = { readonly rule: string; readonly line: number | undefined };
export type PassBudget = { readonly seeded: Set<string>; readonly left: Map<string, number> };
export type PassInput = {
  readonly before: Bytes;
  readonly reported: readonly Reported[];
  readonly budget: PassBudget;
};
type AppliedRuns = { readonly applied: readonly Applied[]; readonly recorded: readonly Applied[] };
type WriteOutcome = {
  readonly rewritten: string[];
  readonly changedMeanwhile: string[];
  readonly unwritable: string[];
  readonly fixedFindings: string[];
};

export function newPassBudget(): PassBudget {
  return { seeded: new Set(), left: new Map() };
}

function budgetKey(name: string, rule: string): string {
  return `${name}\0${rule}`;
}

function recordable(
  budget: PassBudget,
  file: Reported,
  applied: readonly Applied[],
): readonly Applied[] {
  if (!budget.seeded.has(file.name)) {
    budget.seeded.add(file.name);
    for (const { ruleId } of file.messages) {
      const key = budgetKey(file.name, suggestionName(ruleId));
      budget.left.set(key, (budget.left.get(key) ?? 0) + 1);
    }
  }
  return applied.filter(({ rule }) => {
    const key = budgetKey(file.name, rule);
    const left = budget.left.get(key) ?? 0;
    budget.left.set(key, left - 1);
    return left > 0;
  });
}

function fixedText(settings: PlanSettings, original: string, reported: Reported) {
  const { output, messages, fatal } = reported;
  if (fatal) {
    return { text: typeof output === 'string' ? output : original, applied: [] };
  }
  if (settings.selectedRules.length === 0) {
    const base = typeof output === 'string' ? output : original;
    return applySuggestions({ text: base, messages, selectedRules: [] });
  }
  const { text, suggested } = selectedOutput(
    original,
    messages,
    selectedEslintRules(settings.selectedRules),
  );
  return { text: text ?? original, applied: suggested };
}

function analyzerRule(rule: string): string {
  return rule.slice(ANALYZER.length + 1);
}

function recipeOf(settings: PlanSettings, name: string, { applied, recorded }: AppliedRuns) {
  if (settings.selectedRules.length === 0 || applied.length === 0) {
    return {};
  }
  const rules = [...new Set(applied.map(({ rule }) => analyzerRule(rule)))].toSorted();
  return {
    recipe: `${SUGGESTION_RECIPE} ${rules.join(',')} ${name}`,
    safety: REVIEW,
    findings: recorded.map(({ rule, line }) => ({
      tool: ANALYZER,
      rule: analyzerRule(rule),
      path: name,
      line: line ?? 0,
    })),
  };
}

function plannedTexts(settings: PlanSettings, { before, reported, budget }: PassInput) {
  const findings: string[] = [];
  const planned = reported.flatMap((file) => {
    const original = before.get(file.name)?.toString('utf8') ?? '';
    const { text: fixed, applied } = fixedText(settings, original, file);
    appendAll(
      findings,
      applied.map(({ rule, line }) => `${file.name}:${String(line)} ${rule} (eslint-suggestion)`),
    );
    const text = withFixedLineEndingsOf(original, fixed);
    return text === original
      ? []
      : [
          {
            name: file.name,
            text,
            ...recipeOf(settings, file.name, {
              applied,
              recorded: recordable(budget, file, applied),
            }),
          },
        ];
  });
  return { planned, findings };
}

export function writeOutputs(settings: PlanSettings, input: PassInput): WriteOutcome {
  const { before } = input;
  const { planned, findings } = plannedTexts(settings, input);
  const { written, changedMeanwhile, unwritable } = writeTexts(
    settings.writer,
    planned.map((file) => ({ ...file, bytes: before.get(file.name) })),
    TOOL,
  );
  const kept = new Set(written);
  return {
    rewritten: written,
    changedMeanwhile,
    unwritable,
    fixedFindings: findings.filter((finding) => kept.has(finding.slice(0, finding.indexOf(':')))),
  };
}
