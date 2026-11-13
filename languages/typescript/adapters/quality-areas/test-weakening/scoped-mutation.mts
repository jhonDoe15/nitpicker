import { TESTS_FAILED_SKIPPED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import type { Finding } from '../../static-checks/shared.mts';
import type { Layout } from '../../typed/head-policy.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import type { MutationOutcome, MutationReport } from '../typed/mutation.mts';
import { exceptionMatcher } from '../typed/policy.mts';
import { hash } from '../typed/repository.mts';
import { mutationTargets } from '../runners/mutation-scope.mts';
import { sourceLineShifts } from './line-shifts.mts';
import { MAX_TESTED_MODULES, testedSourceModules } from './tested-modules.mts';
import {
  baseMutationTargets,
  changedCodeMutants,
  hasWeakeningCandidates,
  mutationTargetsWithTestedModules,
  type MutationScope,
  weakenedTestFindings,
} from './weakened-mutants.mts';

const NAMED_SKIPS = 5;

type MutationReportOf = (
  options: QualityAreaOptions,
  targets: readonly string[] | undefined,
) => Promise<MutationOutcome>;

type ScopedMutation = {
  readonly layout: Layout;
  readonly exceptions: unknown[];
  readonly mutationReport: MutationReportOf;
  readonly normalize: (report: MutationReport, analyzerName: string) => Finding[];
};

async function weakenedTestsFindings(
  options: QualityAreaOptions,
  {
    headReport,
    mutationScope,
    mutationReport,
  }: {
    readonly headReport: MutationReport;
    readonly mutationScope: MutationScope;
    readonly mutationReport: MutationReportOf;
  },
): Promise<Finding[]> {
  if (!hasWeakeningCandidates(headReport, mutationScope)) {
    return [];
  }
  const scope = { ...mutationScope, lineShifts: sourceLineShifts(options) };
  const baseOptions: QualityAreaOptions = {
    ...options,
    projectRoot: options.baselineRoot ?? options.projectRoot,
    snapshot: 'base',
  };
  const base = await mutationReport(baseOptions, baseMutationTargets(headReport, scope));
  if (base.skipped !== undefined) {
    return base.skipped.filter(({ rule }) => rule !== TESTS_FAILED_SKIPPED_RULE);
  }
  return weakenedTestFindings({
    headReport,
    baseReport: base.report,
    mutationScope: scope,
    analyzerName: options.analyzerName,
  });
}

function skippedModulesNotice(analyzerName: string, skipped: readonly string[]): Finding[] {
  const [first] = skipped;
  if (first === undefined) {
    return [];
  }
  const named = skipped.slice(0, NAMED_SKIPS).join(', ');
  const rest = skipped.length - NAMED_SKIPS;
  const more = rest > 0 ? ` and ${String(rest)} more` : '';
  const digest = hash(skipped.join('\n'));
  const reach = `The changed tests reach more than ${String(MAX_TESTED_MODULES)} production modules`;
  return [
    {
      tool: analyzerName,
      rule: 'tested-modules-capped',
      path: first,
      identity: `tested-modules-capped|${digest}`,
      message: `${reach}, so weaker tests were not checked in ${named}${more}. Run \`nitpicker --all\` to mutate every module.`,
      classification: 'descriptive',
    },
  ];
}

export async function runScopedMutation(
  options: QualityAreaOptions,
  { layout, exceptions, mutationReport, normalize }: ScopedMutation,
): Promise<Finding[]> {
  const targets = mutationTargets(options, layout);
  const tested = testedSourceModules(options, layout);
  if (targets?.length === 0 && tested.modules.length === 0) {
    return [];
  }
  const mutationScope = { targets: targets ?? [], testedModules: tested.modules };
  const head = await mutationReport(
    options,
    targets === undefined ? undefined : mutationTargetsWithTestedModules(targets, tested.modules),
  );
  if (head.skipped !== undefined) {
    return head.skipped;
  }
  const isExcepted = exceptionMatcher(exceptions);
  const weakened = await weakenedTestsFindings(options, {
    headReport: head.report,
    mutationScope,
    mutationReport,
  });
  return [
    ...normalize(changedCodeMutants(head.report, mutationScope), options.analyzerName),
    ...weakened,
  ]
    .filter(({ rule, path }) => !isExcepted(rule, path))
    .concat(skippedModulesNotice(options.analyzerName, tested.skipped));
}
