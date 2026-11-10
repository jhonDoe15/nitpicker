import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { readInspect } from '../structure/go-inspect.mjs';
import { goFacts } from './go-facts.mjs';

const ANALYZER_NAME = 'facts';
const LANGUAGE = 'go';

export function readGoFacts(context) {
  return goFacts(readInspect(context.reportRoot), { module: context.module });
}

export function goFactFindings(facts, policy = {}) {
  return sharedFactFindings(facts, {
    language: LANGUAGE,
    analyzerName: ANALYZER_NAME,
    rules: registeredFactRules(LANGUAGE),
    policy: {
      exceptions: policy.exceptions ?? [],
      ...(policy.layout === undefined ? {} : { layout: policy.layout }),
    },
  });
}
