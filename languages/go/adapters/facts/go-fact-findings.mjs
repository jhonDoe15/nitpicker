import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { inspectBaseline, readInspect } from '../structure/go-inspect.mjs';
import { goFacts } from './go-facts.mjs';

const ANALYZER_NAME = 'facts';
const LANGUAGE = 'go';
const PRIVATE_COPY_FIX = 'Move it to one package, export it and import it.';

export function readGoFacts(context) {
  return goFacts(readInspect(context.reportRoot), { module: context.module });
}

export function readGoBaseline(context) {
  const base = context.snapshot === 'head' ? inspectBaseline(context) : undefined;
  return base === undefined
    ? undefined
    : {
        facts: goFacts(base, { module: context.module }),
        ...(context.baselineMovesFile === undefined
          ? {}
          : { movesFile: context.baselineMovesFile }),
      };
}

export function goFactFindings(facts, { policy = {}, baseline } = {}) {
  return sharedFactFindings(facts, {
    language: LANGUAGE,
    analyzerName: ANALYZER_NAME,
    rules: registeredFactRules(LANGUAGE),
    policy: {
      exceptions: policy.exceptions ?? [],
      ...(policy.layout === undefined ? {} : { layout: policy.layout }),
    },
    duplicatesAcrossPackages: true,
    privateCopyFix: PRIVATE_COPY_FIX,
    siblingCopiesAcrossPackages: true,
    ...(baseline === undefined ? {} : { baseline }),
  });
}
