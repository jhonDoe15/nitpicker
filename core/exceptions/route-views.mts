import { applyFindingExceptions as untypedApplyFindingExceptions } from '../../shared/exceptions/finding-exceptions.mjs';
import { withCanonicalRules as untypedWithCanonicalRules } from '../../shared/exceptions/validation.mjs';
import {
  type ExceptionEntry,
  applyPythonExceptions as typedApplyPythonExceptions,
} from '../../languages/python/adapters/configuration/python-exceptions.mts';
import { textOf } from '../../shared/values/readers.mts';
import { routeFields as untypedRouteFields } from '../../shared/messages/exception-sentence.mjs';

export type Route = { entry: unknown; key: string | undefined };
export type Finding = Readonly<Record<string, unknown>>;
type Fields = { exception?: object | undefined; exceptionList?: string | undefined };
type Canonical = { python: { exceptions: ExceptionEntry[] }; exceptions: object[] };

export const applyFindingExceptions: (findings: Finding[], exceptions: object[]) => unknown[] =
  untypedApplyFindingExceptions;
export function applyPythonExceptions(
  findings: readonly Finding[],
  exceptions: readonly ExceptionEntry[],
): unknown[] {
  return typedApplyPythonExceptions(
    findings.map((finding) => ({
      ...finding,
      tool: textOf(finding['tool']),
      rule: textOf(finding['rule']),
      path: textOf(finding['path']),
    })),
    exceptions,
  );
}
export const withCanonicalRules: (config: object) => Canonical = untypedWithCanonicalRules;
export const routeFields: (message: string) => Fields = untypedRouteFields;
