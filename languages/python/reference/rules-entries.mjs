import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { RULE_HINTS, RULES_TOOL } from '../rules/rule-hints.mjs';
import { allowedOf, describedBy } from './hint-text.mjs';

const PYTHON_ANALYZERS = { python: ['python'] };

/** The entries of the checks nitpicker's own Python script reports (`python-rules/*`). */
export function pythonRulesEntries() {
  return RULE_HINTS.filter(({ tool }) => tool === RULES_TOOL).flatMap((hint) =>
    hint.rules.map((rule) =>
      ruleEntry({
        tool: RULES_TOOL,
        rule,
        page: 'python-nitpicker',
        analyzers: PYTHON_ANALYZERS,
        summary: describedBy(hint),
        why: "One of the checks of nitpicker's own Python script. It runs on the Python source and tests and names one allowed form.",
        allowed: allowedOf(hint),
        exception: { key: 'python.exceptions', rule },
        docs: [{ label: 'Python preset guide', path: 'docs/python-preset.md' }],
      }),
    ),
  );
}
