import { testConsoleFindings } from '../console/console-findings.mjs';
import { docCommentFindings } from '../doc-comments/doc-comments.mjs';
import { exceptionMatcher } from '../exceptions.mjs';
import {
  DEFAULT_FEATURE_LAYOUT,
  featureRoles,
  sharedUsageFindings,
  sharedUsedByOneFeature,
} from '../features/shared-usage.mjs';
import { duplicateDefinitionFindings } from '../reuse/duplicate-definitions.mjs';
import { exportedNameCollisionFindings } from '../reuse/name-collisions.mjs';
import { uniqueFindings } from '../reuse/reuse-finding.mjs';
import { siblingCopyEditFindings } from '../reuse/sibling-copy-edits.mjs';
import { testOnlyFactFindings } from '../test-only/test-only-uses.mjs';
import { baselineFromFacts, baselinePathsOf } from './baseline.mjs';
import { FACT_RULE_LISTS, registeredFactRules } from './registry.mjs';
import { reuseModules } from './reuse-modules.mjs';
import { validateFacts } from './schema.mjs';

function featureLayout(layout = {}) {
  return {
    sharedRoots: layout.sharedRoots ?? DEFAULT_FEATURE_LAYOUT.sharedRoots,
    featureRoots: layout.featureRoots ?? DEFAULT_FEATURE_LAYOUT.featureRoots,
  };
}

function productionFiles(modules) {
  return modules.filter(({ role }) => role !== 'test').map(({ file }) => file);
}

const EVALUATORS = {
  'duplicate-definition': ({ modules, context }) => duplicateDefinitionFindings(modules, context),
  'exported-name-collision': ({ facts, modules, context }) =>
    exportedNameCollisionFindings(modules, facts.imports, context),
  'sibling-copy-edit': ({ modules, context, options }) =>
    siblingCopyEditFindings(modules, {
      ...context,
      baselineFile: options.baselineFile,
      acrossPackages: options.siblingCopiesAcrossPackages === true,
    }),
  'shared-used-by-one-feature': ({ facts, context, options }) =>
    sharedUsageFindings(
      sharedUsedByOneFeature(
        { modules: productionFiles(facts.modules), imports: facts.imports },
        { roleOf: featureRoles(featureLayout(options.policy?.layout)) },
      ),
      context,
    ),
  'test-only-export': ({ facts, context }) =>
    testOnlyFactFindings({ packages: [], ...facts }, context),
  'doc-comment-content': ({ facts, context }) => docCommentFindings(facts.docComments, context),
  'test-console-output': ({ facts, context, options }) =>
    testConsoleFindings(
      { entries: facts.console },
      {
        analyzerName: context.analyzerName,
        allow: options.policy?.testConsole?.allow ?? [],
        exceptions: options.policy?.exceptions ?? [],
      },
    ),
};

function missingList(facts, rules, language) {
  const missing = rules.flatMap((rule) =>
    FACT_RULE_LISTS[rule]
      .filter((list) => !Array.isArray(facts[list]))
      .map((list) => `${rule} needs "${list}"`),
  );
  return missing.length === 0
    ? undefined
    : `The ${language} facts lack lists that registered rules read: ${missing.join('; ')}`;
}

function baselineReader(baseline) {
  if (baseline?.facts === undefined) {
    return undefined;
  }
  const baselinePaths = baselinePathsOf({
    snapshot: 'head',
    baselineMovesFile: baseline.movesFile,
  });
  return baselineFromFacts(validateFacts(baseline.facts), baselinePaths);
}

function selectedRules(language, rules) {
  const registered = registeredFactRules(language);
  const unregistered = (rules ?? []).filter((rule) => !registered.includes(rule));
  if (unregistered.length > 0) {
    throw new Error(
      `${unregistered.join(', ')} is not registered for ${language} in FACT_RULE_LANGUAGES (shared/rules/facts/registry.mjs)`,
    );
  }
  return rules ?? registered;
}

export function sharedFactFindings(
  facts,
  { language, analyzerName, rules: only, policy = {}, baseline, ...rest },
) {
  validateFacts(facts);
  const rules = selectedRules(language, only);
  const problem = missingList(facts, rules, language);
  if (problem !== undefined) {
    throw new Error(problem);
  }
  const context = { analyzerName, isExcepted: exceptionMatcher(policy.exceptions ?? []) };
  const options = { ...rest, policy, baselineFile: baselineReader(baseline) };
  const modules = reuseModules(facts);
  return uniqueFindings(
    rules.flatMap((rule) => EVALUATORS[rule]({ facts, modules, context, options })),
  );
}
