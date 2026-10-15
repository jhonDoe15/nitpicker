export const POLICY_TOOL = 'nitpicker-config';
export const POLICY_RULE = 'policy-loosened';

const ACCEPT_ROUTE =
  'A change that loosens nitpicker.config.json fails until a person accepts it: rerun with ' +
  '--accept-policy-change, or set NITPICKER_ACCEPT_POLICY_CHANGE=1.';

export function policyFindings(loosenings, accepted) {
  return accepted
    ? []
    : loosenings.map((change) => ({
        tool: POLICY_TOOL,
        rule: POLICY_RULE,
        path: 'nitpicker.config.json',
        identity: change,
        message: `${change}. ${ACCEPT_ROUTE}`,
        classification: 'enforceable',
      }));
}
