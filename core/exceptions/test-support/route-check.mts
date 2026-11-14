import {
  applyFindingExceptions,
  applyPythonExceptions,
  routeFields,
  withCanonicalRules,
} from '../route-views.mts';
import type { Finding, Route } from '../route-views.mts';
import { fieldOf, fieldsOf, textOf } from '../../../shared/values/readers.mts';
import { validateConfig } from '../../configuration/validate.mts';

const REASON = 'The test accepts this finding.';

function configFor(preset: string, { entry, key }: Route) {
  const accepted = { ...fieldsOf(entry), reason: REASON };
  return key === 'python.exceptions'
    ? { preset, python: { exceptions: [accepted] } }
    : { preset, exceptions: [accepted] };
}

function remaining(finding: Finding, config: object, key: string | undefined) {
  const canonical = withCanonicalRules(config);
  return key === 'python.exceptions'
    ? applyPythonExceptions([finding], canonical.python.exceptions)
    : applyFindingExceptions([finding], canonical.exceptions);
}

function validationProblem(config: object) {
  try {
    validateConfig(config);
    return undefined;
  } catch (error) {
    return textOf(fieldOf(error, 'message'));
  }
}

export function routeProblems(finding: Finding, message: string, preset: string): string[] {
  const { exception, exceptionList } = routeFields(message);
  if (exception === undefined) {
    return ['the message does not end with an exception route'];
  }
  const route = { entry: exception, key: exceptionList };
  const config = configFor(preset, route);
  const problem = validationProblem(config);
  if (problem !== undefined) {
    return [`the preset rejects the route: ${problem}`];
  }
  return remaining(finding, config, route.key).length === 0
    ? []
    : ['the route does not lift the finding'];
}

export function withoutRouteFields(findings: readonly Finding[]): Record<string, unknown>[] {
  return findings.map((finding) =>
    Object.fromEntries(
      Object.entries(finding).filter(([key]) => key !== 'exception' && key !== 'exceptionList'),
    ),
  );
}
