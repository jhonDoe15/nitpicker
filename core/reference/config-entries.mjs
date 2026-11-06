import { PRESETS, ruleEntry } from '../../shared/reference/entry.mjs';

const POLICY_ALLOWED =
  "Keep the base's policy and change the code until it passes: keep new code under the source roots, where the gate checks it, and fix findings instead of excluding, excepting or reclassifying the code.";

/** The entries of the findings the core adds on top of the analyzers. */
export function coreRuleEntries() {
  return [
    ruleEntry({
      tool: 'nitpicker-config',
      rule: 'policy-loosened',
      page: 'checks',
      analyzers: Object.fromEntries(PRESETS.map((preset) => [preset, []])),
      summary:
        'A change to `nitpicker.config.json` or to a tool config that makes the gate check less than the base did.',
      why: 'A change that loosens the policy it is judged by would pass itself, so a person has to accept it.',
      allowed: POLICY_ALLOWED,
      exception: {
        note: 'It has no `exceptions` entry. Only a person reviewing the change accepts exactly these loosenings, with `--accept-policy-change=<digest>` at an interactive terminal or `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` in CI.',
      },
      docs: [{ label: 'Usage guide', path: 'docs/usage.md' }],
    }),
  ];
}
