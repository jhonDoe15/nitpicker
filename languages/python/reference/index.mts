import { pythonRulesEntries } from './rules-entries.mts';
import { ruffEntries } from './ruff-entries.mts';
import { pythonToolEntries } from './tool-entries.mts';

/** The entries of every rule the Python preset can report beyond the shared checks. */
export function pythonRuleEntries() {
  return [...ruffEntries(), ...pythonRulesEntries(), ...pythonToolEntries()];
}
