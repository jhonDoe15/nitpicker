import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { typescript7Overrides } from '../../../adapters/typecheck/removed-options/typescript7-config.mts';
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

function withTypescript7Config<T>(configPath: string, run: (project: string) => T): T {
  const overrides = typescript7Overrides(configPath);
  if (overrides === undefined) {
    return run(configPath);
  }
  const translated = path.join(
    path.dirname(configPath),
    `.nitpicker-typescript7-${String(process.pid)}.tsconfig.json`,
  );
  try {
    writeFileSync(
      translated,
      JSON.stringify({
        extends: `./${path.basename(configPath)}`,
        compilerOptions: {
          ...overrides.set,
          ...Object.fromEntries(overrides.unset.map((option) => [option, null])),
        },
      }),
    );
  } catch {
    return run(configPath);
  }
  try {
    return run(translated);
  } finally {
    rmSync(translated, { force: true });
  }
}

export function engineUnusedMethods(
  absoluteConfig: string,
  environment: Environment,
  ownRoot?: string,
): { readonly sourceRoot: string; readonly findings: UnusedMethod[] } | undefined {
  const outcome = withTypescript7Config(absoluteConfig, (project) =>
    runTypedChecks({
      project,
      checks: [CHECK],
      ...(ownRoot === undefined
        ? {}
        : { inputs: { [CHECK]: { ownRoot: ownRoot.replaceAll('\\', '/') } } }),
      environment,
    }),
  );
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
