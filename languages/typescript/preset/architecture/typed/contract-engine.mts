import path from 'node:path';
import { runTypedChecks } from '../../../adapters/typed-engine/typed-checks.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';

export type UnusedMethod = {
  readonly file: string;
  readonly contract: string;
  readonly method: string;
};

const CHECK = 'public-contracts';

function unusedMethodOf(value: unknown): UnusedMethod {
  return {
    file: String(fieldOf(value, 'file')).split('/').join(path.sep),
    contract: String(fieldOf(value, 'contract')),
    method: String(fieldOf(value, 'method')),
  };
}

export function engineUnusedMethods(
  absoluteConfig: string,
  environment: Environment,
  ownRoot?: string,
): { readonly sourceRoot: string; readonly findings: UnusedMethod[] } | undefined {
  const outcome = runTypedChecks({
    project: absoluteConfig,
    checks: [CHECK],
    ...(ownRoot === undefined ? {} : { inputs: { [CHECK]: { ownRoot } } }),
    environment,
  });
  const sourceRoot = fieldOf(outcome.report, 'sourceRoot');
  const result = outcome.checks?.[CHECK];
  if (result === undefined || typeof sourceRoot !== 'string') {
    return undefined;
  }
  return {
    sourceRoot: path.resolve(sourceRoot),
    findings: listOf(fieldOf(result, 'findings'))
      .map(unusedMethodOf)
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}
