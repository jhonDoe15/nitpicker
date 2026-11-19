import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

function describe(subject: string): string {
  const [operator = '<operator>', name = '<field>'] = subject.split('.');
  return `\`${operator}.__init__\` uses \`${name}\`, a template field, before Airflow renders it: until \`execute()\` the value is still the unrendered \`"{{ ... }}"\` text, so a check, default or conversion here runs on the template and not on the value the task gets`;
}

export const AIRFLOW_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['templated-field-used-in-init'],
    describe,
    allowed:
      'Only assign the parameter in `__init__` (`self.sql_params = sql_params`) and move the validation, default (`params = self.sql_params if self.sql_params is not None else {}`) and conversion into `execute()`, or into a `render_template_fields` override after `super().render_template_fields(...)`.',
  },
];
