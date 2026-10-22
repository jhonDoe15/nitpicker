import { eslintEntries } from './eslint-entries.mjs';
import { staticEntries } from './static-entries.mjs';

/** The entries of every rule the TypeScript and JavaScript presets can report beyond the shared checks. */
export async function typescriptRuleEntries() {
  return [...(await eslintEntries()), ...staticEntries()];
}
