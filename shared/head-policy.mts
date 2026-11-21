import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NitpickerConfig } from './values/config-types.mts';

export const HEAD_POLICY_ENV = 'NITPICKER_POLICY';

const POLICY_PRESETS: readonly string[] = ['javascript'];

type KeptKey =
  'react' | 'i18n' | 'preset' | 'tools' | 'duplicates' | 'testConsole' | 'protocols' | 'history';

export type HeadPolicy = Required<
  Pick<NitpickerConfig, 'exclude' | 'layout' | 'exceptions' | 'thresholds'>
> &
  Pick<NitpickerConfig, KeptKey>;

type Environment = Readonly<Record<string, string | undefined>>;
type PolicySource = { readonly policyFile: string | undefined; readonly text: string | undefined };

export function resolveHeadPolicy(config: NitpickerConfig = {}): HeadPolicy {
  return {
    exclude: config.exclude ?? [],
    layout: config.layout ?? {},
    exceptions: config.exceptions ?? [],
    thresholds: config.thresholds ?? {},
    ...(config.react === undefined ? {} : { react: config.react }),
    ...(config.i18n === undefined ? {} : { i18n: config.i18n }),
    ...(POLICY_PRESETS.includes(config.preset ?? '') ? { preset: config.preset } : {}),
    ...(config.tools === undefined ? {} : { tools: config.tools }),
    ...(config.duplicates === undefined ? {} : { duplicates: config.duplicates }),
    ...(config.testConsole === undefined ? {} : { testConsole: config.testConsole }),
    ...(config.protocols === undefined ? {} : { protocols: config.protocols }),
    ...(config.history === undefined ? {} : { history: config.history }),
  };
}

export function withHeadPolicyFile<Result>(
  policy: unknown,
  operation: (policyFile: string) => Result,
): Result {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-policy-'));
  const policyFile = path.join(directory, 'policy.json');
  try {
    writeFileSync(policyFile, `${JSON.stringify(policy)}\n`);
    return operation(policyFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function headPolicyEnvironment(policyFile: string): Record<string, string> {
  return { [HEAD_POLICY_ENV]: policyFile };
}

export function readHeadPolicyFile(environment: Environment): Readonly<Record<string, unknown>> {
  const { policyFile, text } = readHeadPolicySource(environment);
  return text === undefined ? {} : parsePolicy(policyFile, text);
}

export function readHeadPolicySource(environment: Environment): PolicySource {
  const policyFile = environment[HEAD_POLICY_ENV];
  return policyFile === undefined || policyFile === ''
    ? { policyFile: undefined, text: undefined }
    : { policyFile, text: readFileSync(policyFile, 'utf8') };
}

function parsePolicy(
  policyFile: string | undefined,
  text: string,
): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${HEAD_POLICY_ENV} file ${policyFile ?? ''} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!isPolicyObject(parsed)) {
    throw new TypeError(`${HEAD_POLICY_ENV} file ${policyFile ?? ''} must contain a JSON object`);
  }
  return parsed;
}

function isPolicyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
