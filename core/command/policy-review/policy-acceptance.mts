const ACCEPT_POLICY_CHANGE_VARIABLE = 'NITPICKER_ACCEPT_POLICY_CHANGE';
const IGNORED_FLAG =
  '--accept-policy-change is honoured only at an interactive terminal, where a person reviews the change; in CI a person sets NITPICKER_ACCEPT_POLICY_CHANGE instead.';
const IGNORED_VARIABLE =
  'NITPICKER_ACCEPT_POLICY_CHANGE is honoured only in CI (CI set); at a terminal a person passes --accept-policy-change instead.';

type Source = 'flag' | 'environment';

type AcceptanceOptions = {
  readonly acceptPolicyChange?: string | undefined;
  readonly shardIndex?: number | undefined;
};

type Acceptance = {
  readonly acceptPolicyChange: string | undefined;
  readonly policyAcceptanceSource?: Source;
  readonly ignoredAcceptance: string | undefined;
  readonly reportsPolicy: boolean;
};

const IGNORED: Readonly<Record<Source, string>> = {
  flag: IGNORED_FLAG,
  environment: IGNORED_VARIABLE,
};

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function requestedAcceptance(
  options: AcceptanceOptions,
  environment: NodeJS.ProcessEnv,
): { readonly source: Source; readonly digest: string } | undefined {
  if (options.acceptPolicyChange !== undefined) {
    return { source: 'flag', digest: options.acceptPolicyChange };
  }
  const fromEnvironment = environment[ACCEPT_POLICY_CHANGE_VARIABLE];
  return isSet(fromEnvironment) ? { source: 'environment', digest: fromEnvironment } : undefined;
}

function isHonoured(source: Source, environment: NodeJS.ProcessEnv, interactive: boolean): boolean {
  return source === 'flag' ? interactive : isSet(environment['CI']);
}

export function policyAcceptance(
  options: AcceptanceOptions,
  environment: NodeJS.ProcessEnv,
  interactive = false,
): Acceptance {
  const requested = requestedAcceptance(options, environment);
  const honoured =
    requested !== undefined && isHonoured(requested.source, environment, interactive);
  return {
    acceptPolicyChange: honoured ? requested.digest : undefined,
    ...(requested === undefined ? {} : { policyAcceptanceSource: requested.source }),
    ignoredAcceptance: requested === undefined || honoured ? undefined : IGNORED[requested.source],
    reportsPolicy: (options.shardIndex ?? 0) === 0,
  };
}
