import { isPlainObject } from '../../config.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { testConsoleFindings } from '../console/console-findings.mjs';
import { docCommentFindings } from '../doc-comments/doc-comments.mjs';
import { exceptionMatcher } from '../exceptions.mjs';
import {
  featureInternalImportFindings,
  sharedImportsFeatureFindings,
} from '../features/feature-boundaries.mjs';
import { featureCycleAnalysis, featureCycleFindings } from '../features/feature-cycles.mjs';
import { featureLayout, featureRoleContract, featureRoles } from '../features/feature-roles.mjs';
import { sharedUsageFindings, sharedUsedByOneFeature } from '../features/shared-usage.mjs';
import { duplicateDefinitionFindings } from '../reuse/duplicate-definitions.mjs';
import { exportedNameCollisionFindings } from '../reuse/name-collisions.mjs';
import { uniqueFindings } from '../reuse/reuse-finding.mjs';
import { siblingCopyEditFindings } from '../reuse/sibling-copy-edits.mjs';
import { testOnlyFactFindings } from '../test-only/test-only-uses.mjs';
import { baselineFromFacts, baselinePathsOf } from './baseline.mjs';
import { FACT_RULE_LISTS, registeredFactRules } from '../../project-rules/fact-rules.mjs';
import { reuseModules, withImportRoles } from './reuse-modules.mjs';
import { validateFacts } from './schema.mjs';

const REGISTRY = 'FACT_RULE_LANGUAGES (shared/project-rules/fact-rules.mjs)';

function sharedUsageSubjects(modules) {
  return modules
    .filter(({ role, generated, initializer }) => role !== 'test' && !generated && !initializer)
    .map(({ file }) => file);
}

function withoutGenerated(facts) {
  const generated = new Set(
    facts.modules.filter((module) => module.generated).map(({ file }) => file),
  );
  return {
    ...facts,
    imports: facts.imports.filter(({ from, to }) => !generated.has(from) && !generated.has(to)),
  };
}

function featureContext(context, options) {
  const roleOf = featureRoleContract(options.policy.layout, options.publicFace);
  return { ...context, roleOf };
}

function featureBoundaryRule(findings) {
  return ({ facts, context, options }) =>
    findings(withoutGenerated(facts), featureContext(context, options));
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
        { modules: sharedUsageSubjects(facts.modules), imports: withoutGenerated(facts).imports },
        { roleOf: featureRoles(featureLayout(options.policy.layout)) },
      ),
      context,
    ),
  'feature-internal-import': featureBoundaryRule(featureInternalImportFindings),
  'shared-imports-feature': featureBoundaryRule(sharedImportsFeatureFindings),
  'feature-cycle': featureBoundaryRule(featureCycleFindings),
  'test-only-export': ({ facts, context }) => testOnlyFactFindings(facts, context),
  'doc-comment-content': ({ facts, context }) => docCommentFindings(facts.docComments, context),
  'test-console-output': ({ facts, context, options }) =>
    testConsoleFindings(
      { entries: facts.console },
      {
        analyzerName: context.analyzerName,
        allow: options.policy.testConsole?.allow ?? [],
        exceptions: options.policy.exceptions ?? [],
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

function validBaselineFacts(facts) {
  try {
    return validateFacts(facts);
  } catch (error) {
    throw new TypeError(`baseline ${error.message}`, { cause: error });
  }
}

function baselineReader(baseline) {
  if (baseline === undefined) {
    return undefined;
  }
  if (typeof baseline?.readFile === 'function') {
    return baseline.readFile;
  }
  if (!isPlainObject(baseline) || baseline.facts === undefined) {
    throw new TypeError('baseline must be { readFile } or { facts, movesFile? }, or be left out');
  }
  const baselinePaths = baselinePathsOf({
    snapshot: 'head',
    baselineMovesFile: baseline.movesFile,
  });
  return baselineFromFacts(validBaselineFacts(baseline.facts), baselinePaths);
}

function validateAnalyzerName(analyzerName) {
  if (typeof analyzerName !== 'string' || analyzerName === '') {
    throw new TypeError(
      '"analyzerName" must be a non-empty string: the analyzer the findings are for',
    );
  }
}

function selectedRules(language, rules) {
  const registered = registeredFactRules(language);
  if (rules === undefined && registered.length === 0) {
    throw new Error(`No fact rule is registered for language "${language}" in ${REGISTRY}`);
  }
  if (rules !== undefined && (!Array.isArray(rules) || rules.length === 0)) {
    throw new TypeError('"rules" must name at least one registered fact rule, or be left out');
  }
  const unregistered = (rules ?? []).filter((rule) => !registered.includes(rule));
  if (unregistered.length > 0) {
    throw new Error(`${unregistered.join(', ')} is not registered for ${language} in ${REGISTRY}`);
  }
  return rules ?? registered;
}

function isGlobs(value) {
  return Array.isArray(value) && value.every((glob) => typeof glob === 'string');
}

function isListOf(value, isEntry) {
  return value === undefined || (Array.isArray(value) && value.every(isEntry));
}

function isException(entry) {
  return (
    isPlainObject(entry) &&
    typeof entry.rule === 'string' &&
    (isGlobs(entry.paths) || typeof entry.glob === 'string')
  );
}

function isAllowEntry(entry) {
  return (
    isPlainObject(entry) &&
    typeof entry.contains === 'string' &&
    (entry.paths === undefined || isGlobs(entry.paths))
  );
}

function isOptionalObject(value) {
  return value === undefined || isPlainObject(value);
}

const POLICY_SHAPES = [
  ['policy.testConsole', (policy) => isOptionalObject(policy.testConsole), 'an object'],
  ['policy.layout', (policy) => isOptionalObject(policy.layout), 'an object'],
  [
    'policy.exceptions',
    (policy) => isListOf(policy.exceptions, isException),
    'an array of { rule, paths } entries',
  ],
  [
    'policy.testConsole.allow',
    (policy) => isListOf(policy.testConsole?.allow, isAllowEntry),
    'an array of { contains, paths? } entries',
  ],
  [
    'policy.layout.sharedRoots',
    (policy) => policy.layout?.sharedRoots === undefined || isGlobs(policy.layout.sharedRoots),
    'an array of folder globs',
  ],
  [
    'policy.layout.notFeatures',
    (policy) => policy.layout?.notFeatures === undefined || isGlobs(policy.layout.notFeatures),
    'an array of folder names',
  ],
  [
    'policy.layout.notFeatureFolders',
    (policy) =>
      policy.layout?.notFeatureFolders === undefined || isGlobs(policy.layout.notFeatureFolders),
    'an array of folders',
  ],
  [
    'policy.layout.aliases',
    (policy) =>
      policy.layout?.aliases === undefined ||
      (isPlainObject(policy.layout.aliases) &&
        Object.values(policy.layout.aliases).every((folder) => typeof folder === 'string')),
    'an object of folder to folder',
  ],
  [
    'policy.layout.featureRoots',
    (policy) => policy.layout?.featureRoots === undefined || isGlobs(policy.layout.featureRoots),
    'an array of folder globs',
  ],
];

function validatePolicy(policy) {
  const failed = isPlainObject(policy)
    ? POLICY_SHAPES.find(([, check]) => !check(policy))
    : ['policy', undefined, 'an object'];
  if (failed !== undefined) {
    const [name, , shape] = failed;
    throw new TypeError(`${name} must be ${shape}: pass the head policy (readHeadPolicyFile())`);
  }
}

function preparedFacts(
  facts,
  { language, analyzerName, rules: only, policy = {}, baseline, ...rest },
) {
  validateFacts(facts);
  validateAnalyzerName(analyzerName);
  validatePolicy(policy);
  const rules = selectedRules(language, only);
  const problem = missingList(facts, rules, language);
  if (problem !== undefined) {
    throw new Error(problem);
  }
  return {
    rules,
    facts: withImportRoles(facts),
    context: { analyzerName, isExcepted: exceptionMatcher(policy.exceptions ?? []) },
    options: { ...rest, policy, baselineFile: baselineReader(baseline) },
  };
}

function evaluated({ rules, facts, context, options }) {
  const modules = reuseModules(facts);
  return rules.flatMap((rule) => EVALUATORS[rule]({ facts, modules, context, options }));
}

export function sharedFactFindings(facts, options) {
  return uniqueFindings(evaluated(preparedFacts(facts, options)));
}

export function featureFactAnalysis(facts, options) {
  const prepared = preparedFacts(facts, options);
  const cycles = prepared.rules.includes(RULE_IDS.featureCycle)
    ? featureCycleAnalysis(
        withoutGenerated(prepared.facts),
        featureContext(prepared.context, prepared.options),
      )
    : { findings: [], cycles: [] };
  const others = {
    ...prepared,
    rules: prepared.rules.filter((rule) => rule !== RULE_IDS.featureCycle),
  };
  const roleOf = featureRoles(featureLayout(prepared.options.policy.layout));
  return {
    findings: uniqueFindings([...evaluated(others), ...cycles.findings]),
    explainedCycles: cycles.cycles,
    featureOf: (file) => roleOf(file).directory,
  };
}
