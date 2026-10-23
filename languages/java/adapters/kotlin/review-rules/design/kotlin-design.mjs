import { readHeadPolicyFile } from '../../../../../../shared/head-policy.mjs';
import { DESIGN_RULES } from '../../../../../../shared/project-rules/design/design-rules.mjs';
import { sharedFactFindings } from '../../../../../../shared/rules/facts/evaluate.mjs';
import { readKotlinDesign } from '../kotlin-facts.mjs';

export const DESIGN_TOOL = 'structure';
export const DESIGN_FAILURE_RULE = 'design-facts';

function failure(message) {
  return {
    tool: DESIGN_TOOL,
    rule: DESIGN_FAILURE_RULE,
    path: '.',
    identity: DESIGN_FAILURE_RULE,
    message: `The design rules did not run on the Kotlin sources: ${message}`,
    classification: 'tool-error',
  };
}

export function kotlinDesignBundle(design) {
  return {
    modules: design.modules,
    packages: [],
    types: design.types,
    callables: design.callables,
  };
}

function designOf(reportRoot) {
  try {
    return { design: readKotlinDesign(reportRoot) };
  } catch (error) {
    return { problem: `the facts report cannot be read (${error.message})` };
  }
}

function evaluate(design, { environment, run }) {
  try {
    return run(kotlinDesignBundle(design), {
      language: 'kotlin',
      analyzerName: DESIGN_TOOL,
      rules: DESIGN_RULES,
      policy: readHeadPolicyFile(environment),
    });
  } catch (error) {
    return [failure(error.message)];
  }
}

export function kotlinDesignFindings(
  reportRoot,
  { environment, evaluator = sharedFactFindings } = {},
) {
  const { design, problem } = designOf(reportRoot);
  if (problem !== undefined) {
    return [failure(problem)];
  }
  if (design === undefined) {
    return [failure('the facts report has no "design" key, so it was written by an older plugin')];
  }
  return typeof design.error === 'string'
    ? [failure(design.error)]
    : evaluate(design, { environment, run: evaluator });
}
