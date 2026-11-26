import { existsSync } from 'node:fs';
import { REPOSITORY_HYGIENE_TOOL, collectRepositoryFindings } from './files/repository-files.mts';
import { runCheckCli } from './cli.mts';
import { hardcodedNameFindings } from './migrations/hardcoded-names.mts';
import { fieldLimitFindings } from './limits/field-limits.mts';
import { foreignKeyIndexFindings } from './schema/foreign-key-index.mts';
import { migrationOrderFindings } from './migrations/migration-order.mts';
import { withoutExcepted, withoutExcluded } from './rules.mts';
import { trackedFiles } from './tracked-files.mts';
import { lintSuppressedEverywhereFindings } from './java-lint/everywhere-findings.mts';
import { minifiedBundleFindings } from './bundles/minified-bundles.mts';
import { muslAllocatorFindings } from './rust/musl-allocators.mts';
import type {
  CheckCliInput,
  CheckOptions,
  HygieneCheck,
  ParseYaml,
  RepositoryContext,
} from './check-types.mts';
import type { Finding } from '../values/findings.mts';

function collectRepositoryHygiene(context: RepositoryContext): Finding[] {
  return [
    ...collectRepositoryFindings(context),
    ...migrationOrderFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...hardcodedNameFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...foreignKeyIndexFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...fieldLimitFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...muslAllocatorFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...minifiedBundleFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...lintSuppressedEverywhereFindings(REPOSITORY_HYGIENE_TOOL, context),
  ];
}

const CHECKS: Readonly<Record<string, (context: RepositoryContext) => Finding[]>> = {
  [REPOSITORY_HYGIENE_TOOL]: collectRepositoryHygiene,
};

function baseFilesOf(
  baselineRoot: string | undefined,
  exclude: readonly string[] | undefined,
): string[] | undefined {
  return baselineRoot === undefined || !existsSync(baselineRoot)
    ? undefined
    : withoutExcluded(trackedFiles(baselineRoot), exclude);
}

export function runHygieneCheck({
  check,
  projectRoot,
  policy = {},
  baselineRoot,
  parseYaml,
}: HygieneCheck): Finding[] {
  const collect = check !== undefined && Object.hasOwn(CHECKS, check) ? CHECKS[check] : undefined;
  if (collect === undefined) {
    throw new Error(`Unknown hygiene check: ${String(check)}`);
  }
  const root = projectRoot ?? process.cwd();
  const files = withoutExcluded(trackedFiles(root), policy.exclude);
  const baseFiles = baseFilesOf(baselineRoot, policy.exclude);
  return withoutExcepted(
    collect({ projectRoot: root, files, baselineRoot, baseFiles, parseYaml }),
    policy.exceptions,
  );
}

export function runHygieneCli(
  cli: Omit<CheckCliInput, 'runCheck' | 'label'> & { readonly parseYaml?: ParseYaml | undefined },
): number {
  return runCheckCli({
    ...cli,
    runCheck: (options: CheckOptions) => runHygieneCheck({ ...options, parseYaml: cli.parseYaml }),
    label: 'Hygiene',
  });
}
