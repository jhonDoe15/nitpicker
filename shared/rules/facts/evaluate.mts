import { isPlainObject } from '../../config.mts';
import {
  fieldOf,
  fieldsOf,
  messageOf,
  optionalText,
  textOf,
  textsOf,
} from '../../values/readers.mts';
import type { Finding } from '../../values/findings.mts';
import { RULE_IDS } from '../../policy.mts';
import { testConsoleFindings } from '../console/console-findings.mts';
import { docCommentFindings } from '../doc-comments/doc-comments.mts';
import { exceptionMatcher } from '../exceptions.mts';
import { featureCycleAnalysis } from '../features/feature-cycles.mts';
import {
  FEATURE_EVALUATORS,
  featureContext,
  layoutRoles,
  moduleGraph,
  withoutGenerated,
} from '../features/feature-evaluators.mts';
import {
  publicAlternativeBypasses,
  publicAlternativeFindings,
} from '../entry-points/public-alternatives.mts';
import { duplicateDefinitionFindings } from '../reuse/duplicate-definitions.mts';
import { exportedNameCollisionFindings } from '../reuse/name-collisions.mts';
import { uniqueFindings } from '../reuse/reuse-finding.mts';
import { siblingCopyEditFindings } from '../reuse/sibling-copy-edits.mts';
import { nearDuplicateFindings } from '../near-duplicates/near-duplicates.mts';
import { decidedConditionFindings } from '../decided/decided-conditions.mts';
import { resultSlipFindings } from '../slips/slip-findings.mts';
import { integerSlipFindings } from '../decided/slips/integer-slips.mts';
import { duplicateBranchFindings } from '../branches/duplicate-branches.mts';
import { shorterConditionFindings } from '../shorter/shorter-conditions.mts';
import { testOnlyFactFindings } from '../test-only/test-only-uses.mts';
import { baselineFromFacts, baselinePathsOf } from './baseline.mts';
import { FACT_RULE_LISTS, registeredFactRules } from '../../project-rules/fact-rules.mts';
import { reuseModules, withImportRoles } from './reuse-modules.mts';
import { validateFacts } from './schema.mts';
import { DESIGN_EVALUATORS } from '../design/design-findings.mts';
import { decidedAhead } from '../../logic/sync/ahead/decided-ahead.mts';
import type { ReuseModule } from './typed/reuse-module-types.mts';
import type { DecidedUnit } from '../decided/typed/decided-types.mts';
import type { BaselineSource, Facts } from './typed/fact-types.mts';
import type {
  EvaluatorInput,
  EvaluatorOptions,
  FactEvaluator,
  FeatureFactAnalysis,
  PreparedFacts,
} from './typed/evaluate-types.mts';
import { assertPolicy } from './typed/policy-check.mts';

const REGISTRY = 'FACT_RULE_LANGUAGES (shared/project-rules/fact-rules.mjs)';

function acrossPackages(modules: readonly ReuseModule[]): ReuseModule[] {
  return modules.map((module) => ({ ...module, packageRoot: '' }));
}

function isFixFor(value: unknown): value is (importer: string) => string | undefined {
  return typeof value === 'function';
}

function fixForOf(value: unknown): ((importer: string) => string | undefined) | undefined {
  return isFixFor(value) ? value : undefined;
}

function namedUnits({ nearDuplicateUnits }: Facts): DecidedUnit[] {
  return (nearDuplicateUnits ?? []).map((unit) => ({
    ...unit,
    id: `${unit.file}#${unit.name}`,
    final: unit.final === true,
  }));
}

function decisionOptions({ decisionWorkers }: EvaluatorOptions): { decisionWorkers?: number } {
  return typeof decisionWorkers === 'number' ? { decisionWorkers } : {};
}

const EVALUATORS: Readonly<Record<string, FactEvaluator>> = {
  'duplicate-definition': ({ modules, context, options }) =>
    duplicateDefinitionFindings(
      options.duplicatesAcrossPackages === true ? acrossPackages(modules) : modules,
      { ...context, privateFix: optionalText(options.privateCopyFix) },
    ),
  'exported-name-collision': ({ facts, modules, context, options }) =>
    exportedNameCollisionFindings(modules, facts.imports ?? [], {
      ...context,
      fixFor: fixForOf(options.collisionFixFor),
    }),
  'sibling-copy-edit': ({ modules, context, options }) =>
    siblingCopyEditFindings(modules, {
      ...context,
      baselineFile: options.baselineFile,
      acrossPackages: options.siblingCopiesAcrossPackages === true,
    }),
  'near-duplicate': ({ facts, context }) =>
    nearDuplicateFindings(facts.nearDuplicateUnits ?? [], context),
  'decided-condition': ({ facts, context, options }) =>
    decidedAhead(
      () => decidedConditionFindings(namedUnits(facts), context),
      decisionOptions(options),
    ),
  'duplicate-branch': ({ facts, context }) =>
    duplicateBranchFindings(facts.nearDuplicateUnits ?? [], context),
  'result-slip': ({ facts, context }) => resultSlipFindings(namedUnits(facts), context),
  'integer-slip': ({ facts, context }) => integerSlipFindings(namedUnits(facts), context),
  'shorter-condition': ({ facts, context, options }) =>
    decidedAhead(
      () => shorterConditionFindings(namedUnits(facts), context),
      decisionOptions(options),
    ),
  'public-alternative-bypass': ({ facts, context }) =>
    publicAlternativeFindings(publicAlternativeBypasses(moduleGraph(facts)), context),
  'test-only-export': ({ facts, context }) => testOnlyFactFindings(facts, context),
  'doc-comment-content': ({ facts, context }) =>
    docCommentFindings(facts.docComments ?? [], context),
  'test-console-output': ({ facts, context, options }) =>
    testConsoleFindings(
      { entries: facts.console ?? [] },
      {
        analyzerName: context.analyzerName,
        allow: options.policy.testConsole?.allow ?? [],
        exceptions: options.policy.exceptions ?? [],
      },
    ),
  ...FEATURE_EVALUATORS,
  ...DESIGN_EVALUATORS,
};

function missingList(facts: Facts, rules: readonly string[], language: string): string | undefined {
  const missing = rules.flatMap((rule) =>
    (FACT_RULE_LISTS[rule] ?? [])
      .filter((list) => !Array.isArray(facts[list]))
      .map((list) => `${rule} needs "${list}"`),
  );
  return missing.length === 0
    ? undefined
    : `The ${language} facts lack lists that registered rules read: ${missing.join('; ')}`;
}

function validBaselineFacts(facts: unknown): Facts {
  try {
    return validateFacts(facts);
  } catch (error) {
    throw new TypeError(`baseline ${messageOf(error)}`, { cause: error });
  }
}

function isBaselineReader(value: unknown): value is BaselineSource {
  return typeof value === 'function';
}

function baselineReader(baseline: unknown): BaselineSource | undefined {
  if (baseline === undefined) {
    return undefined;
  }
  const readFile = fieldOf(baseline, 'readFile');
  if (isBaselineReader(readFile)) {
    return readFile;
  }
  if (!isPlainObject(baseline) || baseline['facts'] === undefined) {
    throw new TypeError('baseline must be { readFile } or { facts, movesFile? }, or be left out');
  }
  const baselinePaths = baselinePathsOf({
    snapshot: 'head',
    baselineMovesFile: baseline['movesFile'],
  });
  return baselineFromFacts(validBaselineFacts(baseline['facts']), baselinePaths);
}

function validateAnalyzerName(analyzerName: unknown): asserts analyzerName is string {
  if (typeof analyzerName !== 'string' || analyzerName === '') {
    throw new TypeError(
      '"analyzerName" must be a non-empty string: the analyzer the findings are for',
    );
  }
}

function selectedRules(language: string, rules: unknown): readonly string[] {
  const registered = registeredFactRules(language);
  if (rules === undefined && registered.length === 0) {
    throw new Error(`No fact rule is registered for language "${language}" in ${REGISTRY}`);
  }
  if (rules !== undefined && (!Array.isArray(rules) || rules.length === 0)) {
    throw new TypeError('"rules" must name at least one registered fact rule, or be left out');
  }
  const requested = rules === undefined ? undefined : textsOf(rules);
  const unregistered = (requested ?? []).filter((rule) => !registered.includes(rule));
  if (unregistered.length > 0) {
    throw new Error(`${unregistered.join(', ')} is not registered for ${language} in ${REGISTRY}`);
  }
  return requested ?? registered;
}

function preparedFacts(facts: unknown, givenOptions: unknown): PreparedFacts {
  const {
    language,
    analyzerName,
    rules: only,
    policy = {},
    baseline,
    ...rest
  } = fieldsOf(givenOptions);
  const validFacts = validateFacts(facts);
  validateAnalyzerName(analyzerName);
  assertPolicy(policy);
  const rules = selectedRules(textOf(language), only);
  const problem = missingList(validFacts, rules, textOf(language));
  if (problem !== undefined) {
    throw new Error(problem);
  }
  return {
    rules,
    facts: withImportRoles(validFacts),
    context: { analyzerName, isExcepted: exceptionMatcher(policy.exceptions ?? []) },
    options: { ...rest, policy, baselineFile: baselineReader(baseline) },
  };
}

function evaluated({ rules, facts, context, options }: PreparedFacts): Finding[] {
  const modules = reuseModules(facts);
  return rules.flatMap((rule) => {
    const evaluator = EVALUATORS[rule];
    if (evaluator === undefined) {
      throw new Error(`No evaluator is defined for fact rule "${rule}"`);
    }
    const input: EvaluatorInput = { facts, modules, context, options };
    return evaluator(input);
  });
}

export function sharedFactFindings(facts: unknown, options: unknown): Finding[] {
  return uniqueFindings(evaluated(preparedFacts(facts, options)));
}

export function featureFactAnalysis(facts: unknown, options: unknown): FeatureFactAnalysis {
  const prepared = preparedFacts(facts, options);
  const cycles = prepared.rules.includes(RULE_IDS.featureCycle)
    ? featureCycleAnalysis(
        withoutGenerated(moduleGraph(prepared.facts)),
        featureContext(prepared.context, prepared.options),
      )
    : { findings: [], cycles: [] };
  const others = {
    ...prepared,
    rules: prepared.rules.filter((rule) => rule !== RULE_IDS.featureCycle),
  };
  const roleOf = layoutRoles(prepared.options);
  return {
    findings: uniqueFindings([...evaluated(others), ...cycles.findings]),
    explainedCycles: cycles.cycles,
    featureOf: (file) => roleOf(file).directory,
  };
}
