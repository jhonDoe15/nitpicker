const RULES_OF_KIND = Object.freeze({
  'parse-at-boundary': [
    'nitpicker/no-handwritten-boundary-guard',
    'nitpicker/no-unvalidated-schema-field',
    'nitpicker/no-unknown-in-domain',
    'handwritten-boundary-guard',
    'pydantic-any-field',
    'pydantic-extra-allow',
    'any-in-domain',
    'explicit-any',
    'type-cast',
    'UnsafeCastOperator',
  ],
  'strengthen-assertion': [
    'nitpicker/no-assertion-in-loop',
    'nitpicker/no-partial-output-assertion',
    'nitpicker/no-unowned-async-assertion',
    'tautological-assert',
    'test-without-assertion',
    'TestClassWithoutTestCases',
    'AssertionInControlFlow',
  ],
  'exercise-production-code': ['nitpicker/test-must-use-production-runtime'],
  'remove-duplicate': [
    'nitpicker/no-copy-pasted-tests',
    'duplicate-definition',
    'RepeatedStringLiteral',
    'repeated-string-literal',
  ],
  'move-module': [
    'test-only-export',
    'spring-layout',
    'spring-test-placement',
    'nitpicker/no-unknown-main-folder',
    'nitpicker/file-name-casing',
    'nitpicker/no-test-helpers-in-source',
    'nitpicker/no-uncollected-tests',
    'nitpicker/no-external-executables-in-unit-tests',
    'test-helper-in-source',
    'stub-beside-source',
    'no-import-outside-roots',
    'TestHelperInSource',
    'GenericPackageName',
  ],
  'reduce-complexity': ['nitpicker/no-self-recursion'],
  'invert-dependency': [
    'nitpicker/no-ui-framework-in-domain',
    'nitpicker/no-managed-resource-construction-outside-composition-roots',
    'nitpicker/no-process-access-outside-composition-root',
    'io-in-domain',
    'logger-in-domain',
    'clock-now',
    'random-in-domain',
    'process-env-access',
    'pydantic-boundary',
    'no-production-cycles',
    'package-cycle',
    'ddd-aggregate-reference',
    'ddd-foreign-entity',
    'ddd-value-object-reference',
    'spring-controller-controller',
    'spring-controller-entity',
    'spring-controller-repository',
    'spring-feature-boundary',
    'spring-repository-service',
    'spring-service-web',
    'spring-shared-pure',
  ],
});

const KIND_OF_RULE = new Map(
  Object.entries(RULES_OF_KIND).flatMap(([kind, rules]) => rules.map((rule) => [rule, kind])),
);

const DEFAULT_KIND = 'follow-allowed-form';

export function kindOfRule(rule) {
  return KIND_OF_RULE.get(rule) ?? DEFAULT_KIND;
}
