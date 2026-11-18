import { isPlainObject } from '../../../../../../shared/values/readers.mts';
import {
  compilePsiProgram as untypedCompilePsiProgram,
  gradleClasspath as untypedGradleClasspath,
  pinnedKotlinCompiler as untypedPinnedKotlinCompiler,
  prepareCompiler as untypedPrepareCompiler,
  runPsiProgram as untypedRunPsiProgram,
  writeSources as untypedWriteSources,
} from '../../../test-support/kotlin/kotlin-psi-program.mts';

type Named = {
  readonly id: string;
  readonly name: string;
  readonly [field: string]: unknown;
};

export type PsiCompiler = {
  readonly javaHome: string | undefined;
  readonly classpath: string;
  readonly classes: string;
  readonly pinned: string | undefined;
  readonly published?: true;
};

export type PsiRun = {
  readonly status: unknown;
  readonly log: string;
  readonly metrics: { readonly functions: readonly Named[]; readonly [field: string]: unknown };
  readonly facts: {
    readonly design: {
      readonly types: readonly Named[];
      readonly callables: readonly Named[];
      readonly modules: readonly unknown[];
      readonly [field: string]: unknown;
    };
    readonly [field: string]: unknown;
  };
};

type PrepareInput = {
  readonly workspace: string;
  readonly project: string;
  readonly gradle: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
};

export const pinnedKotlinCompiler: () => string | undefined = untypedPinnedKotlinCompiler;
export const writeSources: (
  workspace: string,
  name: string,
  files: Readonly<Record<string, string>>,
) => string = untypedWriteSources;
export const gradleClasspath: (input: {
  readonly gradle: string;
  readonly project: string;
  readonly workspace: string;
}) => { readonly javaHome: string; readonly classpath: string } = untypedGradleClasspath;
export const compilePsiProgram: (input: {
  readonly java: string | undefined;
  readonly classpath: string;
  readonly workspace: string;
}) => string = untypedCompilePsiProgram;
export const prepareCompiler: (input: PrepareInput) => PsiCompiler = untypedPrepareCompiler;
function isMetrics(value: unknown): value is PsiRun['metrics'] {
  return isPlainObject(value) && Array.isArray(value['functions']);
}

function isFacts(value: unknown): value is PsiRun['facts'] {
  return isPlainObject(value) && isPlainObject(value['design']);
}

export function runPsiProgram(
  compiler: PsiCompiler,
  project: string,
  roots?: readonly string[],
  properties?: readonly string[],
): PsiRun {
  const run = untypedRunPsiProgram(compiler, project, roots, properties);
  return {
    status: run.status,
    log: run.log,
    metrics: isMetrics(run.metrics) ? run.metrics : { functions: [] },
    facts: isFacts(run.facts) ? run.facts : { design: { types: [], callables: [], modules: [] } },
  };
}
