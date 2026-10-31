import { pythonRulesEntries } from './rules-entries.mjs';
import { ruffEntries } from './ruff-entries.mjs';
import { pythonToolEntries } from './tool-entries.mjs';

/** The entries of every rule the Python preset can report beyond the shared checks. */
export function pythonRuleEntries() {
  return [...ruffEntries(), ...pythonRulesEntries(), ...pythonToolEntries()];
}
