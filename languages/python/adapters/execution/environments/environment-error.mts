import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../../shared/messages/troubleshooting.mjs';

export const ENVIRONMENT_FAILED_RULE = 'environment-failed';

export const OVERRIDE_HINT = 'or set "python.environment"';

export function environmentError(
  message: string,
  anchor: string = TROUBLESHOOTING_ANCHORS.pythonEnvironment,
): Error & { rule: string } {
  return Object.assign(troubleshootingError(message, anchor), { rule: ENVIRONMENT_FAILED_RULE });
}
