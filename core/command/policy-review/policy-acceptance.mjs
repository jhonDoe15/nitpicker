const ACCEPT_POLICY_CHANGE_VARIABLE = 'NITPICKER_ACCEPT_POLICY_CHANGE';
const IGNORED_FLAG =
  '--accept-policy-change is honoured only at an interactive terminal, where a person reviews the change; in CI a person sets NITPICKER_ACCEPT_POLICY_CHANGE instead.';
const IGNORED_VARIABLE =
  'NITPICKER_ACCEPT_POLICY_CHANGE is honoured only in CI (CI set); at a terminal a person passes --accept-policy-change instead.';

function isSet(value) {
  return value !== undefined && value !== '';
}

function requestedAcceptance(options, environment) {
  if (options.acceptPolicyChange !== undefined) {
    return { source: 'flag', digest: options.acceptPolicyChange };
  }
  const fromEnvironment = environment[ACCEPT_POLICY_CHANGE_VARIABLE];
  return isSet(fromEnvironment) ? { source: 'environment', digest: fromEnvironment } : undefined;
}

function isHonoured(source, environment, interactive) {
  return source === 'flag' ? interactive === true : isSet(environment.CI);
}

export function policyAcceptance(options, environment, interactive = false) {
  const requested = requestedAcceptance(options, environment);
  const honoured =
    requested !== undefined && isHonoured(requested.source, environment, interactive);
  return {
    acceptPolicyChange: honoured ? requested.digest : undefined,
    ...(requested === undefined ? {} : { policyAcceptanceSource: requested.source }),
    ignoredAcceptance:
      requested === undefined || honoured
        ? undefined
        : requested.source === 'flag'
          ? IGNORED_FLAG
          : IGNORED_VARIABLE,
    reportsPolicy: (options.shardIndex ?? 0) === 0,
  };
}
