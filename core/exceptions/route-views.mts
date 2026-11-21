import { applyFindingExceptions as sharedApplyFindingExceptions } from '../../shared/exceptions/finding-exceptions.mts';
import { withCanonicalRules } from '../../shared/exceptions/validation.mts';
import {
  type ExceptionEntry,
  applyPythonExceptions as typedApplyPythonExceptions,
} from '../../languages/python/adapters/configuration/python-exceptions.mts';
import { fieldOf, listOf, textOf } from '../../shared/values/readers.mts';

export { routeFields } from '../../shared/messages/exception-sentence.mts';

export type Route = { entry: unknown; key: string | undefined };
export type Finding = Readonly<Record<string, unknown>>;

const PYTHON_KEY = 'python.exceptions';

function routable(finding: Finding) {
  return {
    ...finding,
    tool: textOf(finding['tool']),
    rule: textOf(finding['rule']),
    path: textOf(finding['path']),
    identity: textOf(finding['identity']),
  };
}

function isExceptionEntry(value: unknown): value is ExceptionEntry {
  return typeof fieldOf(value, 'rule') === 'string' && Array.isArray(fieldOf(value, 'paths'));
}

export function canonicalExceptions(config: object, key: string | undefined): ExceptionEntry[] {
  const canonical = withCanonicalRules(config);
  const listed =
    key === PYTHON_KEY
      ? fieldOf(fieldOf(canonical, 'python'), 'exceptions')
      : fieldOf(canonical, 'exceptions');
  return listOf(listed).filter(isExceptionEntry);
}

export function applyFindingExceptions(
  findings: readonly Finding[],
  exceptions: readonly ExceptionEntry[],
): readonly unknown[] {
  return sharedApplyFindingExceptions(findings.map(routable), exceptions);
}

export function applyPythonExceptions(
  findings: readonly Finding[],
  exceptions: readonly ExceptionEntry[],
): unknown[] {
  return typedApplyPythonExceptions(findings.map(routable), exceptions);
}
