import { pythonRulesEntries } from './rules-entries.mts';
import { ruffEntries } from './ruff-entries.mts';
import { pythonToolEntries } from './tool-entries.mts';
import type { EntryView } from './typed/hint-views.mts';

export function pythonRuleEntries(): EntryView[] {
  return [...ruffEntries(), ...pythonRulesEntries(), ...pythonToolEntries()];
}
