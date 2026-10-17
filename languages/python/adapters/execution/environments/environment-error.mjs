const ENVIRONMENT_FAILED_RULE = 'environment-failed';

export const OVERRIDE_HINT = 'or set "python.environment"';

export function environmentError(message) {
  return Object.assign(new Error(message), { rule: ENVIRONMENT_FAILED_RULE });
}
