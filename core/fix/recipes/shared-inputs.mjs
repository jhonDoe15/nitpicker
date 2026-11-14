import { fixerError } from '../common/fix-command.mjs';
import {
  hygieneInputs,
  UNTRACK_RULES,
} from '../../../shared/fix/recipes/hygiene/hygiene-inputs.mjs';
import { exceptionMatcher } from '../../../shared/rules/exceptions.mjs';

const HYGIENE_TOOL = 'repository-hygiene';
const HYGIENE_SELECTIONS = new Set(UNTRACK_RULES.map((rule) => `${HYGIENE_TOOL}/${rule}`));

export function sharedInputs({ projectRoot, headPolicy = {}, selectedRules }) {
  const inputs = { isExcepted: exceptionMatcher(headPolicy.exceptions ?? []) };
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
