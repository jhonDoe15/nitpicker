import { DEFAULT_LIBRARIES } from '../rules/libraries/project-libraries.mts';
import type { RuleHintView } from './typed/hint-views.mts';

const SUBJECT = '<name>';

export function allowedOf(hint: RuleHintView): string | undefined {
  return typeof hint.allowed === 'function'
    ? hint.allowed(SUBJECT, DEFAULT_LIBRARIES, '')
    : hint.allowed;
}

export function describedBy(hint: RuleHintView): string | undefined {
  return hint.describe?.(SUBJECT, DEFAULT_LIBRARIES, hint.referenceData ?? {});
}
