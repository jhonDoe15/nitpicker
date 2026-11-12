import { eslintEntries } from './eslint-entries.mts';
import { staticEntries } from './static-entries.mts';

/** The entries of every rule the TypeScript and JavaScript presets can report beyond the shared checks. */
export function typescriptRuleEntries() {
  return [...eslintEntries(), ...staticEntries()];
}
