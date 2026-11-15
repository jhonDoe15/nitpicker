export type SarifRegion = { readonly startLine: number; readonly startColumn?: number };

export type SarifLocation = {
  readonly physicalLocation: {
    readonly artifactLocation: { readonly uri: string };
    readonly region?: SarifRegion;
  };
};

type SarifNotification = {
  readonly message: { readonly text: string };
  readonly level: string;
};

export type SarifInvocation = {
  readonly executionSuccessful: boolean;
  readonly toolExecutionNotifications?: readonly SarifNotification[];
};

export type SarifResult = {
  readonly message: { readonly text: string };
  readonly level: string;
  readonly ruleId: string;
  readonly locations: readonly SarifLocation[];
  readonly partialFingerprints: Readonly<Record<string, string>>;
};

export type SarifRun = {
  readonly tool: {
    readonly driver: { readonly name: string; readonly rules?: readonly { readonly id: string }[] };
  };
  readonly invocations?: readonly SarifInvocation[];
  readonly results: readonly SarifResult[];
};

export type SarifLog = {
  readonly version: string;
  readonly $schema: string;
  readonly runs: readonly SarifRun[];
};

export type XmlState = { readonly stack: string[]; roots: number };

export function isSarifLog(value: unknown): value is SarifLog {
  return typeof value === 'object' && value !== null;
}
