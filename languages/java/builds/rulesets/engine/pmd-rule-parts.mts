import { childrenNamed, type XmlElement } from '../../../../../shared/ingest/report-records.mts';
import type { ResolvedRule } from './pmd-catalog.mts';

export type EngineRule = {
  readonly name: string;
  readonly xpath: string;
  readonly port: string;
  readonly message: string;
  readonly suppress: string;
  readonly properties: Readonly<Record<string, { readonly type: string; readonly value: string }>>;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};
type RuleProperty = { readonly type: string; readonly value: string };

const XPATH_RULE = 'net.sourceforge.pmd.lang.rule.xpath.XPathRule';
const UNUSED_SUPPRESSION_RULE = 'net.sourceforge.pmd.lang.rule.impl.UnnecessaryPmdSuppressionRule';
const RULE_PACKAGE = 'net.sourceforge.pmd.lang.java.rule';
const PORTED_RULES: ReadonlySet<string> = new Set(
  [
    'bestpractices.AbstractClassWithoutAbstractMethodRule',
    'bestpractices.ArrayIsStoredDirectlyRule',
    'bestpractices.AvoidReassigningCatchVariablesRule',
    'bestpractices.AvoidReassigningLoopVariablesRule',
    'bestpractices.AvoidReassigningParametersRule',
    'bestpractices.AvoidUsingHardCodedIPRule',
    'bestpractices.CheckResultSetRule',
    'bestpractices.ForLoopCanBeForeachRule',
    'bestpractices.GuardLogStatementRule',
    'bestpractices.JUnitUseExpectedRule',
    'bestpractices.LiteralsFirstInComparisonsRule',
    'bestpractices.LooseCouplingRule',
    'bestpractices.MethodReturnsInternalArrayRule',
    'bestpractices.MissingOverrideRule',
    'bestpractices.PreserveStackTraceRule',
    'bestpractices.PrimitiveWrapperInstantiationRule',
    'bestpractices.SimplifiableTestAssertionRule',
    'bestpractices.UnitTestShouldIncludeAssertRule',
    'bestpractices.UnnecessaryVarargsArrayCreationRule',
    'bestpractices.UnusedAssignmentRule',
    'bestpractices.UnusedFormalParameterRule',
    'bestpractices.UnusedLocalVariableRule',
    'bestpractices.UnusedPrivateFieldRule',
    'bestpractices.UnusedPrivateMethodRule',
    'bestpractices.UseCollectionIsEmptyRule',
    'bestpractices.UseEnumCollectionsRule',
    'bestpractices.UseTryWithResourcesRule',
    'codestyle.ConfusingTernaryRule',
    'design.SimplifyBooleanReturnsRule',
    'design.SimplifyConditionalRule',
    'errorprone.AssignmentInOperandRule',
    'errorprone.AssignmentToNonFinalStaticRule',
    'errorprone.AvoidBranchingStatementAsLastInLoopRule',
    'errorprone.AvoidDuplicateLiteralsRule',
    'errorprone.AvoidUsingOctalValuesRule',
    'errorprone.BrokenNullCheckRule',
    'errorprone.CheckSkipResultRule',
    'errorprone.CloneMethodMustImplementCloneableRule',
    'errorprone.CloseResourceRule',
    'errorprone.ConfusingArgumentToVarargsMethodRule',
    'errorprone.ConstructorCallsOverridableMethodRule',
    'errorprone.DetachedTestCaseRule',
    'errorprone.IdempotentOperationsRule',
    'errorprone.ImplicitSwitchFallThroughRule',
    'errorprone.InvalidLogMessageFormatRule',
    'errorprone.JUnitSpellingRule',
    'errorprone.JUnitStaticSuiteRule',
    'errorprone.NonSerializableClassRule',
    'errorprone.NullAssignmentRule',
    'errorprone.OverrideBothEqualsAndHashcodeRule',
    'errorprone.ProperCloneImplementationRule',
    'errorprone.SingleMethodSingletonRule',
    'errorprone.SingletonClassReturningNewInstanceRule',
    'errorprone.SuspiciousOctalEscapeRule',
    'errorprone.TestClassWithoutTestCasesRule',
    'errorprone.UnnecessaryCaseChangeRule',
    'errorprone.UselessOperationOnImmutableRule',
    'multithreading.DoubleCheckedLockingRule',
    'multithreading.NonThreadSafeSingletonRule',
    'multithreading.UnsynchronizedStaticFormatterRule',
    'performance.AddEmptyStringRule',
    'performance.AppendCharacterWithCharRule',
    'performance.BigIntegerInstantiationRule',
    'performance.ConsecutiveAppendsShouldReuseRule',
    'performance.ConsecutiveLiteralAppendsRule',
    'performance.InefficientEmptyStringCheckRule',
    'performance.InefficientStringBufferingRule',
    'performance.RedundantFieldInitializerRule',
    'performance.StringInstantiationRule',
    'performance.UseIndexOfCharRule',
    'performance.UseStringBufferForStringAppendsRule',
    'performance.UselessStringValueOfRule',
    'security.HardCodedCryptoKeyRule',
    'security.InsecureCryptoIvRule',
  ]
    .map((rule) => `${RULE_PACKAGE}.${rule}`)
    .concat(UNUSED_SUPPRESSION_RULE),
);
const QUERY = 'xpath';
const SUPPRESS_QUERY = 'violationSuppressXPath';
const SUPPRESS_REGEX = 'violationSuppressRegex';
const ERROR_PRIORITIES = new Set(['1', '2']);
const WARNING_PRIORITY = '3';
const DEFAULT_PRIORITY = '5';
const QUOTED_SECTION = /\\Q(?<literal>[\s\S]*?)(?:\\E|$)/gu;
const REGEX_SPECIAL = /[$()*+.?[\\\]^{|}]/gu;

function propertyElements(element: XmlElement): XmlElement[] {
  return childrenNamed(element, 'properties').flatMap((group) => childrenNamed(group, 'property'));
}

function valueOf(property: XmlElement): string {
  return property.attrs['value'] ?? childrenNamed(property, 'value')[0]?.text ?? '';
}

function ruleProperties({ definition, overrides }: ResolvedRule): Map<string, RuleProperty> {
  const properties = new Map<string, RuleProperty>();
  for (const element of [definition, ...overrides]) {
    for (const property of propertyElements(element)) {
      const name = property.attrs['name'] ?? '';
      const type = properties.get(name)?.type || (property.attrs['type'] ?? '');
      properties.set(name, { type, value: valueOf(property) });
    }
  }
  return properties;
}

export function overriddenProperties({ overrides }: ResolvedRule): XmlElement[] {
  const properties = new Map<string, XmlElement>();
  for (const property of overrides.flatMap(propertyElements)) {
    properties.set(property.attrs['name'] ?? '', property);
  }
  return [...properties.values()];
}

function lastOf<Value>(values: readonly (Value | undefined)[]): Value | undefined {
  return values.findLast((value) => value !== undefined);
}

export function overriddenMessage({ overrides }: ResolvedRule): string | undefined {
  return lastOf(overrides.map(({ attrs }) => attrs['message']));
}

export function overriddenPriority({ overrides }: ResolvedRule): string | undefined {
  return lastOf(overrides.map((element) => childrenNamed(element, 'priority')[0]?.text?.trim()));
}

function ruleMessage(rule: ResolvedRule): string {
  return overriddenMessage(rule) ?? rule.definition.attrs['message'] ?? '';
}

export function ruleLevel(rule: ResolvedRule): 'error' | 'warning' | 'note' {
  const priority =
    overriddenPriority(rule) ??
    childrenNamed(rule.definition, 'priority')[0]?.text?.trim() ??
    DEFAULT_PRIORITY;
  if (ERROR_PRIORITIES.has(priority)) {
    return 'error';
  }
  return priority === WARNING_PRIORITY ? 'warning' : 'note';
}

function portOf(rule: ResolvedRule): string {
  const name = rule.definition.attrs['class'];
  return name !== undefined && PORTED_RULES.has(name) ? name : '';
}

export function needsWholeRun(rule: ResolvedRule): boolean {
  return rule.definition.attrs['class'] === UNUSED_SUPPRESSION_RULE;
}

export function runsOnPmd(rule: ResolvedRule): boolean {
  return !runsOnEngine(rule) && rule.definition.attrs['maximumLanguageVersion'] === undefined;
}

function isWrittenQuery(
  rule: ResolvedRule,
  properties: ReturnType<typeof ruleProperties>,
): boolean {
  const xpath = properties.get(QUERY)?.value;
  return (
    rule.definition.attrs['class'] === XPATH_RULE && xpath !== undefined && xpath.trim() !== ''
  );
}

export function runsOnEngine(rule: ResolvedRule): boolean {
  const { attrs } = rule.definition;
  const properties = ruleProperties(rule);
  return (
    (isWrittenQuery(rule, properties) || portOf(rule) !== '') &&
    attrs['language'] === 'java' &&
    attrs['maximumLanguageVersion'] === undefined &&
    (properties.get(SUPPRESS_REGEX)?.value ?? '') === ''
  );
}

export function portablePattern(javaPattern: string): string {
  return javaPattern.replaceAll(QUOTED_SECTION, (...match) => {
    const groups: unknown = match.at(-1);
    const literal =
      typeof groups === 'object' && groups !== null && 'literal' in groups ? groups.literal : '';
    return String(literal).replaceAll(REGEX_SPECIAL, (special) => `\\${special}`);
  });
}

export function engineRule(
  rule: ResolvedRule,
  scope: { readonly include: readonly string[]; readonly exclude: readonly string[] },
): EngineRule {
  const properties = ruleProperties(rule);
  return {
    name: rule.name,
    xpath: properties.get(QUERY)?.value ?? '',
    port: portOf(rule),
    message: ruleMessage(rule),
    suppress: properties.get(SUPPRESS_QUERY)?.value ?? '',
    properties: Object.fromEntries(
      [...properties].filter(([name]) => ![QUERY, SUPPRESS_QUERY, SUPPRESS_REGEX].includes(name)),
    ),
    include: scope.include.map(portablePattern),
    exclude: scope.exclude.map(portablePattern),
  };
}
