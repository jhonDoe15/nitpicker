import type TypeScript from 'typescript';
import type { Finding } from '../static-checks/shared.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { exceptionRoute as untypedExceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { appendSentence as untypedAppendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { definedField as untypedDefinedField } from '../../../../shared/messages/messages.mjs';
import { regexpRuleHints as untypedRegexpRuleHints } from '../../preset/eslint-config/regexp/regexp-rules.mjs';
import { restrictedMatchers as untypedRestrictedMatchers } from '../../preset/eslint-config/test-honesty/restricted-matchers.mjs';

export type HintInput = {
  readonly ruleId: string;
  readonly text: string;
  readonly relativePath: string;
  readonly node: TypeScript.Node | undefined;
  readonly sourceFile: TypeScript.SourceFile;
};

export type HintedFields = { readonly message: string; readonly allowedForm?: string };

export type Rewriter = (input: Omit<HintInput, 'ruleId'>) => string | HintedFields;

export type RouteSubject = { readonly rule: string; readonly path: string };

const exceptionRouteOf: (finding: {
  readonly rule: string;
  readonly path: string;
  readonly function: undefined;
  readonly name: undefined;
  readonly key: undefined;
}) => string | undefined = untypedExceptionRoute;

const appendSentence: (message: string, sentence: string | undefined) => string =
  untypedAppendSentence;

export const definedField: (
  name: 'allowedForm',
  value: string | undefined,
) => { readonly allowedForm?: string } = untypedDefinedField;

export const regexpRuleHints: () => (readonly [string, string])[] = untypedRegexpRuleHints;

export function restrictedMatcherText(matcher: string): string | undefined {
  const text = fieldOf(untypedRestrictedMatchers, matcher);
  return typeof text === 'string' ? text : undefined;
}

const NO_ROUTE_RULES = new Set([
  'eslint/unused-disable-directive',
  'eslint/inline-config-disabled',
]);

export function eslintRoute({ rule, path: relativePath }: RouteSubject): string | undefined {
  return NO_ROUTE_RULES.has(rule)
    ? undefined
    : exceptionRouteOf({
        rule,
        path: relativePath,
        function: undefined,
        name: undefined,
        key: undefined,
      });
}

export function withEslintRoute(text: string, finding: RouteSubject): string {
  return appendSentence(text, eslintRoute(finding));
}

const METRIC_GROWTH_ADVICE = 'Put new code in a new function.';

export function metricGrowth(
  finding: Pick<Finding, 'rule' | 'path' | 'symbol'>,
  plan: { readonly label: string; readonly value: number },
): { readonly worseMessage: string; readonly worseAllowedForm: string } {
  return {
    worseMessage: withEslintRoute(
      `${finding.symbol ?? 'This function'} ${plan.label} grew from {base} to ${String(plan.value)}. ${METRIC_GROWTH_ADVICE}`,
      finding,
    ),
    worseAllowedForm: METRIC_GROWTH_ADVICE,
  };
}
