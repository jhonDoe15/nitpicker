import { RULE_IDS } from '../../../../shared/policy.mjs';
import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { inspectBaseline, readInspect } from '../structure/go-inspect.mjs';
import { readTestRun } from '../tests/go-test.mjs';
import { goFacts } from './go-facts.mjs';

const ANALYZER_NAME = 'facts';
const CONSOLE_ANALYZER_NAME = 'test-runtime';
const LANGUAGE = 'go';
const PRIVATE_COPY_FIX = 'Move it to one package, export it and import it.';
const COPY_RULES = new Set([RULE_IDS.duplicateDefinition, RULE_IDS.siblingCopyEdit]);
const OWN_TOOL_RULES = new Set([
  ...COPY_RULES,
  RULE_IDS.testConsoleOutput,
  RULE_IDS.publicAlternativeBypass,
]);
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
  return goFacts(readInspect(context.reportRoot), {
    module: context.module,
    testRun: readTestRun(context.reportRoot),
  });
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

function findings(facts, { rules, policy, baseline, analyzerName = ANALYZER_NAME }) {
  return rules.length === 0
    ? []
    : sharedFactFindings(facts, {
        language: LANGUAGE,
        analyzerName,
        rules,
        policy: {
          exceptions: policy.exceptions ?? [],
          ...(policy.layout === undefined ? {} : { layout: policy.layout }),
          ...(policy.testConsole === undefined ? {} : { testConsole: policy.testConsole }),
          ...(policy.protocols === undefined ? {} : { protocols: policy.protocols }),
        },
        publicFace: PUBLIC_FACES.go,
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
      rules: registered.filter((rule) => !OWN_TOOL_RULES.has(rule)),
      policy,
    }),
    ...findings(facts, {
      rules: registered.filter((rule) => rule === RULE_IDS.testConsoleOutput),
      policy,
      analyzerName: CONSOLE_ANALYZER_NAME,
    }),
  ];
}
