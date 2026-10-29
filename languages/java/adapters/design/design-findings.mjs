import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import { DESIGN_RULES } from '../../../../shared/project-rules/design/design-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { produceDesignFacts } from './producer/design-facts.mjs';

export const DESIGN_FACTS_FAILURE_RULE = 'design-facts-failure';
export const DESIGN_FACTS_FILE = 'design-facts.json';

function toolError(analyzerName, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    tool: analyzerName,
    rule: DESIGN_FACTS_FAILURE_RULE,
    path: '.',
    identity: DESIGN_FACTS_FAILURE_RULE,
    message: `The design rules could not read the Java sources: ${message}`,
    classification: 'tool-error',
  };
}

export function designPolicy(policy = {}, head = readHeadPolicyFile()) {
  const protocols = policy.protocols ?? head.protocols;
  return {
    ...head,
    ...(protocols === undefined ? {} : { protocols }),
    exceptions: policy.exceptions ?? head.exceptions ?? [],
  };
}

export function designFindings({
  projectRoot,
  modules,
  policy,
  analyzerName = 'java',
  output,
  evaluate = sharedFactFindings,
}) {
  if (analyzerName !== 'java') {
    return [];
  }
  try {
    const facts = produceDesignFacts({ projectRoot, modules, output });
    return evaluate(facts, {
      language: 'java',
      analyzerName,
      policy: designPolicy(policy),
      rules: DESIGN_RULES,
    });
  } catch (error) {
    return [toolError(analyzerName, error)];
  }
}
