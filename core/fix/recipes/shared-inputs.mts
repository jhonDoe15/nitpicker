import { fixerError } from '../tool-steps/commands/fix-command.mts';
import {
  hygieneInputs,
  UNTRACK_RULES,
} from '../../../shared/fix/recipes/hygiene/hygiene-inputs.mts';
import { exceptionMatcher } from '../../../shared/rules/exceptions.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';

const HYGIENE_TOOL = 'repository-hygiene';
const HYGIENE_SELECTIONS = new Set(UNTRACK_RULES.map((rule) => `${HYGIENE_TOOL}/${rule}`));

export function sharedInputs({
  projectRoot,
  headPolicy = {},
  selectedRules,
}: {
  readonly projectRoot: string;
  readonly headPolicy?: object | undefined;
  readonly selectedRules: readonly string[];
}): { inputs: Readonly<Record<string, unknown>>; toolErrors: unknown[] } {
  const inputs = { isExcepted: exceptionMatcher(listOf(fieldOf(headPolicy, 'exceptions'))) };
  if (!selectedRules.some((rule) => HYGIENE_SELECTIONS.has(rule))) {
    return { inputs, toolErrors: [] };
  }
  try {
    return {
      inputs: { ...inputs, hygiene: hygieneInputs({ projectRoot, policy: headPolicy }) },
      toolErrors: [],
    };
  } catch (error) {
    return { inputs, toolErrors: [fixerError('fix-hygiene', error)] };
  }
}
