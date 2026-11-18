import { DEFAULT_LIBRARIES } from '../rules/libraries/project-libraries.mts';
import type { RuleHintView } from './typed/hint-views.mts';

const SUBJECT = '<name>';

export function allowedOf(hint: RuleHintView): unknown {
  return typeof hint.allowed === 'function'
    ? Reflect.apply(hint.allowed, undefined, [SUBJECT, DEFAULT_LIBRARIES])
    : hint.allowed;
}

export function describedBy(hint: RuleHintView): string | undefined {
  return hint.describe?.(SUBJECT, DEFAULT_LIBRARIES, hint.referenceData ?? {});
}
