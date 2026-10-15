export const ACCEPT_POLICY_CHANGE_VARIABLE = 'NITPICKER_ACCEPT_POLICY_CHANGE';

export function policyAcceptance(options, environment) {
  return {
    acceptPolicyChange:
      options.acceptPolicyChange || environment[ACCEPT_POLICY_CHANGE_VARIABLE] === '1',
    reportsPolicy: (options.shardIndex ?? 0) === 0,
  };
}
