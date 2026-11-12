import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { appendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { definedField } from '../../../../shared/messages/messages.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { projectRunnerVocabulary } from '../../preset/test-runner/vocabulary/runner-vocabulary.mjs';
import { UNUSED_PARAMETER_HINT } from '../../preset/eslint-config/policy/unused-parameters.mjs';
import { regexpRuleHints } from '../../preset/eslint-config/regexp/regexp-rules.mjs';
import { immutableTypesParts } from './immutable-types-hint.mjs';
import { directive, hinted, withStatedForm } from './stated-form.mjs';
import { testRunnerRewriters } from './test-runner/test-runner-hints.mjs';
import { logicRuleHints } from '../../preset/eslint-config/logic/logic-rules.mjs';

const IMMUTABLE_TYPES_PREFIX =
  /^(Variable|Parameter|Return type|Property) should have an immutability of at least/u;

const FIX_TYPE_ERROR_FIRST = 'fix any TypeScript error on the line first';

const UNRESOLVED_TYPE =
  /could not be resolved|cannot be resolved|error typed|of type error\b|of an error /u;

const UNRESOLVED_TYPE_HINT =
  ' The type is unresolved because of a TypeScript error, often a failed import: fix that error first.';

const LEGACY_ANY_HINT = ` If the value is a legacy \`any\`, read it through one reader function whose parameter is \`unknown\` and that returns a typed object, kept in adapters/; ${FIX_TYPE_ERROR_FIRST}.`;

const DOMAIN_LEGACY_ANY_HINT = ` If the value is a legacy \`any\`, domain/ cannot take \`unknown\`: have adapters/ parse it into a typed object and pass that in, or type the legacy parameter; ${FIX_TYPE_ERROR_FIRST}.`;

const JAVASCRIPT_TYPE_SOURCE =
  ' Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`)';

const JAVASCRIPT_LEGACY_ANY_HINT = `${JAVASCRIPT_TYPE_SOURCE}, or read fields of a legacy \`any\` value through one reader function whose parameter is \`{unknown}\` and that returns a typed object.`;

const JAVASCRIPT_DOMAIN_LEGACY_ANY_HINT = `${JAVASCRIPT_TYPE_SOURCE}: domain/ cannot take \`{unknown}\`, so have adapters/ parse a legacy \`any\` value into a typed object and pass that in.`;

const DOMAIN_PATH = /(?:^|\/)features\/[^/]+\/domain\//u;

const ONLY_THROW_ERROR_TEXT = 'Expected an error object to be thrown.';

const THROW_ERROR_HINT = 'Throw an Error subclass.';

const THROW_ERROR_TEST_HINT = `${THROW_ERROR_HINT} A test double that must throw a non-Error value types it \`unknown\`: \`const value: unknown = 7; throw value;\`.`;

const ATOMIC_UPDATE_HINT =
  ' Another call can change it during the `await`, and this write then overwrites that change. Await the new value into a local first and then read and write the shared state in one step with no `await` between them (`const delta = await load(); state.total += delta;`). A lock or a queue around the update is not recognized: when the state is already serialized or confined to one task, add a reviewed exception.';

const DUPLICATE_CONSTITUENTS_HINT =
  ' The members are now the same type: use the one type the feature exports (e.g. `import type { Message }`), not a `ReturnType<...>` alias.';

const INVALID_VOID_HINT =
  ' Use `undefined` instead of `void` here: `Promise.withResolvers<undefined>()` and `resolve(undefined)`.';

const SWITCH_NOT_EXHAUSTIVE_TEXT = 'Switch is not exhaustive';

const SWITCH_NOT_EXHAUSTIVE_HINT =
  '. If this function is already over a size limit, adding cases will fail the size check: extract an exhaustive helper instead (e.g. a `Record<Union, number>` lookup).';

const UNUSED_PARAMETER_TAIL =
  /\s*(?:Allowed unused args must match [^\s]+|Unused parameters should start with a '_')\.$/u;

const FLOATING_PROMISE_TEXT = /^Promises must be awaited/u;

const FLOATING_PROMISE_MESSAGE = `Await this promise: \`await job()\`, or \`await Promise.all([...])\` for several; \`.then()\` and \`.catch()\` do not count. Deliberate fire-and-forget is written \`void job();\`, and in production code \`job\` is an async function whose whole body is a \`try\` with a \`catch\` that does not rethrow.`;

const EVAL_MESSAGE = `Do not evaluate a string as code. Call the function directly, look it up in a table keyed by name, or parse the data with JSON.parse and a schema.`;

const PARAM_REASSIGN_HINT = ` Declare a new const with another name instead of reassigning the parameter. An exception fits only when the reassignment is deliberate.`;

const CURLY_HINT = ` Wrap the body in braces: \`if (done) { return; }\`.`;

const NAMING_HINT = `. Types are PascalCase; functions, variables and parameters are camelCase; constants may be UPPER_CASE; a schema constant may be PascalCase (\`const Order = z.object(...)\`). An exception fits only when an external API forces the name.`;

const RETURN_TYPE_TEXT = /^Missing return type on function\.?$/u;

const RETURN_TYPE_MESSAGE =
  'Write the return type of an exported function: `export function total(rows: readonly Row[]): number`, `export async function load(): Promise<Report>`; a React component returns `ReactElement`.';

const ARGUMENT_TYPE_HINT = ' Write the parameter type in the signature: `(rows: readonly Row[])`.';

const DUPLICATE_IMPORT_HINT = ' Merge the imports of one module into a single import statement.';

const UNUSED_VARIABLE_HINT = ' Remove it, or use it.';

const DEPRECATED_HINT = ` Call the replacement that the deprecation names instead of the deprecated API. An exception fits only when it names none and the API cannot be avoided.`;

function immutableTypesRewrite({ text, node, sourceFile }) {
  const kind = IMMUTABLE_TYPES_PREFIX.exec(text)?.[1];
  return kind === undefined ? text : immutableTypesParts({ kind, node, sourceFile });
}

function legacyAnyHint(relativePath) {
  const inDomain = DOMAIN_PATH.test(relativePath);
  if (readLayout().javascript) {
    return inDomain ? JAVASCRIPT_DOMAIN_LEGACY_ANY_HINT : JAVASCRIPT_LEGACY_ANY_HINT;
  }
  return inDomain ? DOMAIN_LEGACY_ANY_HINT : LEGACY_ANY_HINT;
}

function unsafeAnyMessage({ text, relativePath }) {
  if (UNRESOLVED_TYPE.test(text)) {
    return hinted(text, UNRESOLVED_TYPE_HINT);
  }
  if (readLayout().isTestFile(relativePath)) {
    return hinted(
      text,
      ` In tests the \`any\` usually comes from ${projectRunnerVocabulary().anyInTests}, and ${FIX_TYPE_ERROR_FIRST}.`,
    );
  }
  return hinted(text, legacyAnyHint(relativePath));
}

function onlyThrowErrorMessage({ text, relativePath }) {
  if (text !== ONLY_THROW_ERROR_TEXT) {
    return text;
  }
  return directive(
    readLayout().isTestFile(relativePath) ? THROW_ERROR_TEST_HINT : THROW_ERROR_HINT,
  );
}

function duplicateConstituentsMessage({ text }) {
  return hinted(text, DUPLICATE_CONSTITUENTS_HINT);
}

function invalidVoidMessage({ text }) {
  return hinted(text, INVALID_VOID_HINT);
}

function switchExhaustivenessMessage({ text }) {
  return text.startsWith(SWITCH_NOT_EXHAUSTIVE_TEXT)
    ? hinted(text, SWITCH_NOT_EXHAUSTIVE_HINT)
    : text;
}

function floatingPromiseMessage({ text }) {
  return FLOATING_PROMISE_TEXT.test(text) ? directive(FLOATING_PROMISE_MESSAGE) : text;
}

function boundaryTypesMessage({ text }) {
  return RETURN_TYPE_TEXT.test(text)
    ? directive(RETURN_TYPE_MESSAGE)
    : hinted(text.replace(/\.?$/u, '.'), ARGUMENT_TYPE_HINT);
}

function unusedVariableMessage({ text }) {
  return UNUSED_PARAMETER_TAIL.test(text)
    ? hinted(text.replace(UNUSED_PARAMETER_TAIL, ''), UNUSED_PARAMETER_HINT)
    : hinted(text, UNUSED_VARIABLE_HINT);
}

function appendHint(hint) {
  return ({ text }) => hinted(text, hint);
}

function sentenceHint(hint) {
  return ({ text }) => hinted(text.trimEnd().replace(/(?<![.!?])$/u, '.'), hint);
}

const MESSAGE_REWRITERS = new Map([
  ...testRunnerRewriters(appendHint),
  ['functional/prefer-immutable-types', immutableTypesRewrite],
  ['@typescript-eslint/no-unsafe-member-access', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-argument', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-assignment', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-call', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-return', unsafeAnyMessage],
  ['@typescript-eslint/only-throw-error', onlyThrowErrorMessage],
  ['@typescript-eslint/no-duplicate-type-constituents', duplicateConstituentsMessage],
  ['@typescript-eslint/switch-exhaustiveness-check', switchExhaustivenessMessage],
  ['@typescript-eslint/no-invalid-void-type', invalidVoidMessage],
  ['@typescript-eslint/no-floating-promises', floatingPromiseMessage],
  ['nitpicker/naming-convention', appendHint(NAMING_HINT)],
  ['@typescript-eslint/explicit-module-boundary-types', boundaryTypesMessage],
  ['nitpicker/require-atomic-updates', appendHint(ATOMIC_UPDATE_HINT)],
  ['no-eval', () => directive(EVAL_MESSAGE)],
  ['no-param-reassign', appendHint(PARAM_REASSIGN_HINT)],
  ['@typescript-eslint/no-unused-vars', unusedVariableMessage],
  ['curly', appendHint(CURLY_HINT)],
  ['no-duplicate-imports', appendHint(DUPLICATE_IMPORT_HINT)],
  ...regexpRuleHints().map(([rule, hint]) => [rule, appendHint(hint)]),
  ['@typescript-eslint/no-deprecated', appendHint(DEPRECATED_HINT)],
  ['no-unused-vars', unusedVariableMessage],
  ...Object.entries(logicRuleHints).map(([rule, hint]) => [rule, sentenceHint(hint)]),
]);

const NO_ROUTE_RULES = new Set([
  'eslint/unused-disable-directive',
  'eslint/inline-config-disabled',
]);

export function eslintRoute({ rule, path: relativePath }) {
  return NO_ROUTE_RULES.has(rule) ? undefined : exceptionRoute({ rule, path: relativePath });
}

function withEslintRoute(text, finding) {
  return appendSentence(text, eslintRoute(finding));
}

const METRIC_GROWTH_ADVICE = 'Put new code in a new function.';

export function metricGrowth(finding, plan) {
  return {
    worseMessage: withEslintRoute(
      `${finding.symbol ?? 'This function'} ${plan.label} grew from {base} to ${String(plan.value)}. ${METRIC_GROWTH_ADVICE}`,
      finding,
    ),
    worseAllowedForm: METRIC_GROWTH_ADVICE,
  };
}

function eslintHint({ ruleId, text, relativePath, node, sourceFile }) {
  const rewrite = MESSAGE_REWRITERS.get(ruleId);
  const rewritten =
    rewrite === undefined ? text : rewrite({ text, relativePath, node, sourceFile });
  return withStatedForm(ruleId, typeof rewritten === 'string' ? { message: rewritten } : rewritten);
}

export function eslintMessageWithHint(options) {
  return eslintHint(options).message;
}

export function routedEslintFields(options) {
  const { message, allowedForm } = eslintHint(options);
  return {
    message: withEslintRoute(message, { rule: options.ruleId, path: options.relativePath }),
    ...definedField('allowedForm', allowedForm),
  };
}

const UNSUPPORTED_DIRECTIVE_TEXT = '/* eslint-env */ comments are no longer supported';

export function withoutFatalDirectives(messages) {
  return messages.filter(
    (message) =>
      !(message?.fatal === true && message.message?.startsWith(UNSUPPORTED_DIRECTIVE_TEXT)),
  );
}
