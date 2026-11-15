import { eslintEntries } from './eslint-entries.mts';
import { staticEntries } from './static-entries.mts';
import type { RuleEntry } from './typed/entry-types.mts';

export function typescriptRuleEntries(): RuleEntry[] {
  return [...eslintEntries(), ...staticEntries()];
}
