export type FailureMessageCase = {
  name: string;
  config: unknown;
  filename?: string;
  banned: string;
  allowed: string;
};

export type CaseRow = readonly [name: string, banned: string, allowed: string, filename?: string];

export type Fixture = { config: unknown; filename: string; code: string };

export type CaseOutcome = { ok: boolean; reason?: string; messages: string[] };

export type SignatureOptions = { typedConfig: unknown; typedFile: string };
