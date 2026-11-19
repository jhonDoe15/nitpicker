import { LOGIC_POLICY_FILES } from '../eslint-config/logic/logic-policy-files.mjs';
import { IO_POLICY_FILES } from '../eslint-plugin/rules/support/io-policy-files.mjs';
import { REQUEST_TEXT_POLICY_FILES } from '../eslint-plugin/rules/request-text/request-text-policy-files.mjs';
import { COLLECTION_POLICY_FILES } from '../eslint-plugin/rules/collections/collection-policy-files.mjs';
import { ARCHITECTURE_CONFIG, POLICY_TYPESCRIPT_CONFIG } from '../dependency-graph/cruise.mjs';
import { HTTP_VALUE_POLICY_FILES } from '../eslint-plugin/rules/http-values/origins/http-policy-files.mjs';
import { PROJECT_TOOL_FILES } from '../project-tools/project-config-files.mjs';
import { QUERY_RULE_FILES } from '../../../../shared/rules/queries/query-rule-files.mjs';
import { LIFECYCLE_POLICY_FILES } from './lifecycles/lifecycle-policy-files.mjs';
import { RULE_BACKED_MEASURE_FILES } from '../../conventions/measures/parsing/rule-backed-measures.mjs';
import { PLUGIN_RULE_FILES } from './plugin-rules/plugin-rule-files.mjs';

export const JAVASCRIPT_PRESET_FILE = 'languages/javascript/preset/javascript-preset.mjs';

export const POLICY_FILES = [
  ...QUERY_RULE_FILES,
  ...RULE_BACKED_MEASURE_FILES,
  ...LOGIC_POLICY_FILES,
  ...COLLECTION_POLICY_FILES,
  ...REQUEST_TEXT_POLICY_FILES,
  ...IO_POLICY_FILES,
  ...HTTP_VALUE_POLICY_FILES,
  ...LIFECYCLE_POLICY_FILES,
  'shared/test-timeouts/resolve.mjs',
  'shared/paths/glob.mjs',
  'shared/head-policy.mjs',
  'shared/policy.mjs',
  'shared/traversal.mjs',
  'shared/hygiene/migrations/migration-files.mjs',
  'shared/joins/crossed-collections.mjs',
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/head-policy.mjs',
  JAVASCRIPT_PRESET_FILE,
  'languages/javascript/preset/documentation/jsdoc.mjs',
  'languages/javascript/preset/eslint-dialect.mjs',
  'languages/typescript/preset/eslint-config/concurrency/atomic-updates.mjs',
  'languages/typescript/preset/eslint-config/exceptions.mjs',
  'languages/typescript/preset/eslint-config/policies/error-wrapping-policy.mjs',
  'languages/typescript/preset/eslint-config/strict.mjs',
  'languages/typescript/preset/eslint-config/strict/strict-control-flow.mjs',
  'languages/typescript/preset/eslint-config/truthiness/truthiness-rules.mjs',
  'languages/typescript/preset/eslint-config/logic/logic-rules.mjs',
  'languages/typescript/preset/eslint-config/policy/production-policy.mjs',
  'languages/typescript/preset/eslint-config/policy/security-facts.mjs',
  'languages/typescript/preset/eslint-config/policy/learned-options.mjs',
  'languages/typescript/preset/structure/reuse/reuse-paths.mjs',
  'languages/typescript/preset/eslint-config/strict-adapters.mjs',
  'languages/typescript/preset/eslint-config/strict/strict-declarations.mjs',
  'languages/typescript/preset/eslint-config/strict/strict-domain.mjs',
  'languages/typescript/preset/eslint-config/strict/strict-escape-hatches.mjs',
  'languages/typescript/preset/eslint-config/strict-tests.mjs',
  'languages/typescript/preset/eslint-config/scope-support.mjs',
  'languages/typescript/preset/eslint-config/server/server-rules.mjs',
  'languages/typescript/preset/eslint-config/server/server-scope.mjs',
  'languages/typescript/preset/libraries/file-libraries.mjs',
  'languages/typescript/preset/libraries/logger-libraries.mjs',
  'languages/typescript/preset/libraries/module-bindings.mjs',
  'languages/typescript/preset/libraries/project-libraries.mjs',
  'languages/typescript/preset/libraries/schema-calls.mjs',
  'languages/typescript/preset/libraries/validation-libraries.mjs',
  'languages/typescript/preset/eslint-config/i18n/i18n-filters.mjs',
  'languages/typescript/preset/eslint-config/i18n/i18n-plugin.mjs',
  'languages/typescript/preset/eslint-config/i18n/i18n-rules.mjs',
  'languages/typescript/preset/eslint-config/i18n/i18n-scope.mjs',
  'languages/typescript/preset/eslint-config/react/react-plugins.mjs',
  'languages/typescript/preset/eslint-config/react/react-rules.mjs',
  'languages/typescript/preset/eslint-config/react/react-scope.mjs',
  'languages/typescript/preset/eslint-config/rule-hints.mjs',
  ...PLUGIN_RULE_FILES,
];

export const DEPENDENCY_GRAPH_FILES = [
  ARCHITECTURE_CONFIG,
  'languages/typescript/preset/dependency-graph/cruise.mjs',
  POLICY_TYPESCRIPT_CONFIG,
  'languages/typescript/adapters/dependency-graph/project-config/dependency-cruiser-layers.mjs',
  'languages/typescript/adapters/dependency-graph/project-dependency-graph.mjs',
  ...PROJECT_TOOL_FILES,
];

export const TEST_RUNNER_CONFIGURATION_FILES = [
  'core/tooling/host-environment.mjs',
  'shared/conventions/read-inside.mjs',
  'shared/conventions/tool-precedence.mjs',
  'languages/typescript/preset/project-configs/config-module.mjs',
  'languages/typescript/preset/project-configs/test-runner/mocha-config.mjs',
  'languages/typescript/preset/project-configs/test-runner/test-retry.mjs',
  'languages/typescript/preset/project-configs/test-runner/test-runner-config.mjs',
  'languages/typescript/preset/test-environment/config-files.mjs',
  'languages/typescript/preset/test-environment/read-environment.mjs',
  'languages/typescript/preset/test-runner/detect-runner.mjs',
  'languages/typescript/preset/test-runner/mocha-config-files.mjs',
  'languages/typescript/preset/test-runner/test-files/mocha-options.mjs',
  'languages/typescript/preset/test-runner/runners.mjs',
  'languages/typescript/preset/test-runner/script-command.mjs',
];
