const POLICY_TOOL = 'nitpicker-config';
const POLICY_RULE = 'policy-loosened';

const ACCEPT_ROUTE =
  'Stop and ask a person to review this change; they accept it with --accept-policy-change ' +
  '(or NITPICKER_ACCEPT_POLICY_CHANGE=1 in CI).';

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
