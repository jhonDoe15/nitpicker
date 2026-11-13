import { requiredText } from '../../../scripts/json/fields.mts';

export function capture(match: RegExpExecArray, group: number): string {
  return requiredText(match[group], `regular expression group ${String(group)}`);
}
