import { applyFindingExceptions } from '../../../shared/exceptions/finding-exceptions.mjs';
import { withCanonicalRules } from '../../../shared/exceptions/validation.mjs';
import { applyPythonExceptions } from '../../../languages/python/adapters/configuration/python-exceptions.mjs';
import { validateConfig } from '../../configuration/validate.mjs';

const ROUTE =
  /If this is intended, add (\{.*\}) to "((?:python\.)?exceptions)" in nitpicker\.config\.json\.$/su;

const REASON = 'The test accepts this finding.';

function configFor(preset, { entry, key }) {
  const accepted = { ...entry, reason: REASON };
  return key === 'python.exceptions'
    ? { preset, python: { exceptions: [accepted] } }
    : { preset, exceptions: [accepted] };
}

function remaining(finding, config, key) {
  const canonical = withCanonicalRules(config);
  return key === 'python.exceptions'
    ? applyPythonExceptions([finding], canonical.python.exceptions)
    : applyFindingExceptions([finding], canonical.exceptions);
}

function validationProblem(config) {
  try {
    validateConfig(config);
    return undefined;
  } catch (error) {
    return error.message;
  }
}

/** What is wrong with the route that `message` ends with: empty when its own preset accepts it and it lifts `finding`. */
export function routeProblems(finding, message, preset) {
  const found = ROUTE.exec(message);
  if (found === null) {
    return ['the message does not end with an exception route'];
  }
  const route = { entry: JSON.parse(found[1]), key: found[2] };
  const config = configFor(preset, route);
  const problem = validationProblem(config);
  if (problem !== undefined) {
    return [`the preset rejects the route: ${problem}`];
  }
  return remaining(finding, config, route.key).length === 0
    ? []
    : ['the route does not lift the finding'];
}

/** Whether `message` ends with an exception route. */
export function hasRoute(message) {
  return ROUTE.test(message);
}
