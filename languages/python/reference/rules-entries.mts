import { RULES_TOOL } from '../rules/rule-hints.mts';
import { textsOf } from '../../../shared/values/readers.mts';
import { allowedOf, describedBy } from './hint-text.mts';
import { counterpartsOf, RULE_HINTS, ruleEntry } from './typed/hint-views.mts';
import type { EntryView } from './typed/hint-views.mts';

const PYTHON_ANALYZERS = { python: ['python'] };

export function pythonRulesEntries(): EntryView[] {
  return RULE_HINTS.filter(({ tool }) => tool === RULES_TOOL).flatMap((hint) =>
    textsOf(hint.rules).map((rule) =>
      ruleEntry({
        tool: RULES_TOOL,
        rule,
        page: 'python-nitpicker',
        analyzers: PYTHON_ANALYZERS,
        summary: describedBy(hint),
        why: "One of the checks of nitpicker's own Python script. It runs on the Python source and tests and names one allowed form.",
        allowed: allowedOf(hint),
        exception:
          hint.exception === 'top-level'
            ? { key: 'exceptions', rule }
            : { key: 'python.exceptions', rule },
        docs: [
          { label: 'Python preset guide', path: 'docs/python-preset.md' },
          ...counterpartsOf(rule),
        ],
      }),
    ),
  );
}
