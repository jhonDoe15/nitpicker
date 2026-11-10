import { RULE_IDS } from '../../../../shared/policy.mjs';
import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { inspectBaseline, readInspect } from '../structure/go-inspect.mjs';
import { goFacts } from './go-facts.mjs';

const ANALYZER_NAME = 'facts';
const LANGUAGE = 'go';
const PRIVATE_COPY_FIX = 'Move it to one package, export it and import it.';
const COPY_RULES = new Set([RULE_IDS.duplicateDefinition, RULE_IDS.siblingCopyEdit]);
const COPIED_KIND = 'function';

function copyFacts({ constrained = [], ...facts }) {
  const variants = new Set(constrained);
  return {
    ...facts,
    definitions: facts.definitions.filter(
      ({ kind, file }) => kind === COPIED_KIND && !variants.has(file),
    ),
  };
}

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

function findings(facts, { rules, policy, baseline }) {
  return rules.length === 0
    ? []
    : sharedFactFindings(facts, {
        language: LANGUAGE,
        analyzerName: ANALYZER_NAME,
        rules,
        policy: {
          exceptions: policy.exceptions ?? [],
          ...(policy.layout === undefined ? {} : { layout: policy.layout }),
        },
        duplicatesAcrossPackages: true,
        siblingCopiesAcrossPackages: true,
        privateCopyFix: PRIVATE_COPY_FIX,
        ...(baseline === undefined ? {} : { baseline }),
      });
}

function copyBaseline(baseline) {
  return baseline?.facts === undefined
    ? baseline
    : { ...baseline, facts: copyFacts(baseline.facts) };
}

export function goFactFindings({ constrained, ...facts }, { policy = {}, baseline } = {}) {
  const registered = registeredFactRules(LANGUAGE);
  return [
    ...findings(copyFacts({ ...facts, constrained }), {
      rules: registered.filter((rule) => COPY_RULES.has(rule)),
      policy,
      baseline: copyBaseline(baseline),
    }),
    ...findings(facts, {
      rules: registered.filter((rule) => !COPY_RULES.has(rule)),
      policy,
    }),
  ];
}
