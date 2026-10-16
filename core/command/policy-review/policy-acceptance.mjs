const ACCEPT_POLICY_CHANGE_VARIABLE = 'NITPICKER_ACCEPT_POLICY_CHANGE';

export function policyAcceptance(options, environment) {
  const fromEnvironment = environment[ACCEPT_POLICY_CHANGE_VARIABLE];
  return {
    acceptPolicyChange:
      options.acceptPolicyChange ?? (fromEnvironment === '' ? undefined : fromEnvironment),
    reportsPolicy: (options.shardIndex ?? 0) === 0,
  };
}
