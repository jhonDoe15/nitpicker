import { sharedRouteRule } from '../../../../shared/exceptions/routes.mjs';
import { FUNCTION_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import {
  applyFindingExceptions,
  findingPaths,
  globMatcher,
} from '../typed/runner/exception-views.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import { RUFF_SELECTOR } from './python-rule-ids.mts';

export type Routable = Pick<Finding, 'tool' | 'rule' | 'path'>;

export type ExceptionEntry = {
  readonly rule: string;
  readonly paths: readonly string[];
  readonly function?: string;
  readonly name?: string;
  readonly [field: string]: unknown;
};

function covers(rule: string, finding: Routable): boolean {
  return (
    rule === finding.rule ||
    (finding.tool === 'ruff' && RUFF_SELECTOR.test(rule) && finding.rule.startsWith(rule))
  );
}

function narrowed({ function: functionName, name }: ExceptionEntry): boolean {
  return functionName !== undefined || name !== undefined;
}

export function pythonRouteRule(finding: Finding): unknown {
  return FUNCTION_EXCEPTION_RULES.includes(finding.rule) ? sharedRouteRule(finding) : undefined;
}

export function applyPythonExceptions<T extends Routable>(
  findings: readonly T[],
  exceptions: readonly ExceptionEntry[] = [],
): T[] {
  const lifted = exceptions
    .filter((entry) => !narrowed(entry))
    .map(({ rule, paths }) => ({
      rule,
      matchers: paths.map((glob: string) => globMatcher(glob)),
    }));
  return applyFindingExceptions(
    findings.filter(
      (finding) =>
        !lifted.some(
          ({ rule, matchers }) =>
            covers(rule, finding) &&
            matchers.some((matcher) => findingPaths(finding).some((file) => matcher.test(file))),
        ),
    ),
    exceptions.filter(narrowed),
  );
}
