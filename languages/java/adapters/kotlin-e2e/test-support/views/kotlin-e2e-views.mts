import type { Finding } from '../../../../../../shared/values/findings.mts';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../../../shared/values/readers.mts';
import { callUntyped } from '../../../typed/java-values.mts';
import { findingsOf } from '../../../kotlin/rules/test-support/findings-list.mts';
import { resolveProjectHeadPolicy as untypedResolveProjectHeadPolicy } from '../../../../../../core/conventions/project-head-policy.mjs';
import {
  copyFixtureRepository as untypedCopyFixtureRepository,
  runInitThenAll as untypedRunInitThenAll,
} from '../../../../../../core/init/test-support/init-then-all.mjs';
import { exceptionHint as untypedExceptionHint } from '../../../../../../shared/rules/exceptions.mjs';
import { validateFacts as untypedValidateFacts } from '../../../../../../shared/rules/facts/schema.mjs';
import { kotlinDesignBundle as untypedKotlinDesignBundle } from '../../../kotlin/review-rules/design/kotlin-design.mjs';
import { analyzeWithIncludedBuild as untypedAnalyzeWithIncludedBuild } from '../../../test-support/gradle-e2e.mjs';
import { exceptionRoute as untypedExceptionRoute } from '../../../../../../shared/exceptions/rule-names.mjs';
import { collectJavaFindings as untypedCollectJavaFindings } from '../../../java-diff.mts';
import {
  analyzeJavaSnapshot as untypedAnalyzeJavaSnapshot,
  withHeadPolicy as untypedWithHeadPolicy,
} from '../../../java-runner.mts';

export type CollectOptions = Readonly<Record<string, unknown>>;
export type SnapshotResult = {
  readonly findings: Finding[];
  readonly [field: string]: unknown;
};
type RouteInput = {
  readonly rule: string;
  readonly path: string;
  readonly function?: string;
  readonly name?: string;
  readonly key?: string;
};

function collect(root: string, options: CollectOptions): Finding[] {
  return findingsOf(callUntyped(untypedCollectJavaFindings, root, options));
}

function analyze(root: string, options: CollectOptions): SnapshotResult {
  const snapshot = callUntyped(untypedAnalyzeJavaSnapshot, root, options);
  return { ...fieldsOf(snapshot), findings: findingsOf(fieldOf(snapshot, 'findings')) };
}

export function collectJavaFindings(root: string, options: CollectOptions = {}): Finding[] {
  return collect(root, options);
}

export function analyzeJavaSnapshot(root: string, options: CollectOptions = {}): SnapshotResult {
  return analyze(root, options);
}

export function exceptionRoute(input: RouteInput): string {
  const route: unknown = untypedExceptionRoute({
    function: undefined,
    name: undefined,
    key: undefined,
    ...input,
  });
  return typeof route === 'string' ? route : '';
}

type CommandOutput = { readonly exitCode: unknown; readonly text: string };
type InitThenAll = {
  readonly init: CommandOutput;
  readonly all: CommandOutput;
  readonly config: string;
  readonly summary: unknown;
  readonly toolErrors: unknown;
};
type IncludedBuild = {
  readonly status: unknown;
  readonly output: string;
  readonly mutations: string[];
  readonly findings: Finding[];
  readonly nested: Finding[];
};

export const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;
export const validateFacts: (facts: unknown) => unknown = untypedValidateFacts;
export const kotlinDesignBundle: (design: unknown) => unknown = untypedKotlinDesignBundle;
export const copyFixtureRepository: (input: {
  readonly fixtureRoot: string;
  readonly prefix: string;
  readonly ignored: string[];
}) => string = untypedCopyFixtureRepository;
export const runInitThenAll: (root: string) => InitThenAll = untypedRunInitThenAll;
export function analyzeWithIncludedBuild(
  fixture: string,
  options: { readonly gradle: string | undefined; readonly policy: CollectOptions },
): IncludedBuild {
  const run = callUntyped(untypedAnalyzeWithIncludedBuild, fixture, options);
  return {
    status: fieldOf(run, 'status'),
    output: textOf(fieldOf(run, 'output')),
    mutations: textsOf(fieldOf(run, 'mutations')),
    findings: findingsOf(fieldOf(run, 'findings')),
    nested: findingsOf(fieldOf(run, 'nested')),
  };
}

export function resolveProjectHeadPolicy(
  config: CollectOptions,
  projectRoot: string,
  host: CollectOptions,
): CollectOptions {
  return fieldsOf(
    Reflect.apply(untypedResolveProjectHeadPolicy, undefined, [config, projectRoot, host]),
  );
}

export function withHeadPolicy(policy: CollectOptions, headPolicy: CollectOptions): CollectOptions {
  return fieldsOf(Reflect.apply(untypedWithHeadPolicy, undefined, [policy, headPolicy]));
}
