import { createHash } from 'node:crypto';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { mutationTargets } from '../runners/mutation-scope.mjs';
import { sourceLineShifts } from './line-shifts.mjs';
import { MAX_TESTED_MODULES, testedSourceModules } from './tested-modules.mjs';
import {
  baseMutationTargets,
  changedCodeMutants,
  hasWeakeningCandidates,
  mutationTargetsWithTestedModules,
  weakenedTestFindings,
} from './weakened-mutants.mjs';

const NAMED_SKIPS = 5;

async function weakenedTestsFindings(options, { headReport, mutationScope, mutationReport }) {
  if (!hasWeakeningCandidates(headReport, mutationScope)) return [];
  const scope = { ...mutationScope, lineShifts: sourceLineShifts(options) };
  const baseOptions = { ...options, projectRoot: options.baselineRoot, snapshot: 'base' };
  const base = await mutationReport(baseOptions, baseMutationTargets(headReport, scope));
  if (base.skipped !== undefined) return base.skipped;
  return weakenedTestFindings({
    headReport,
    baseReport: base.report,
    mutationScope: scope,
    analyzerName: options.analyzerName,
  });
}

function skippedModulesNotice(analyzerName, skipped) {
  if (skipped.length === 0) return [];
  const named = skipped.slice(0, NAMED_SKIPS).join(', ');
  const rest = skipped.length - NAMED_SKIPS;
  const more = rest > 0 ? ` and ${String(rest)} more` : '';
  const digest = createHash('sha256').update(skipped.join('\n')).digest('hex').slice(0, 24);
  const reach = `The changed tests reach more than ${String(MAX_TESTED_MODULES)} production modules`;
  return [
    {
      tool: analyzerName,
      rule: 'tested-modules-capped',
      path: skipped[0],
      identity: `tested-modules-capped|${digest}`,
      message: `${reach}, so weaker tests were not checked in ${named}${more}. Run \`nitpicker --all\` to mutate every module.`,
      classification: 'descriptive',
    },
  ];
}

export async function runScopedMutation(
  options,
  { layout, exceptions, mutationReport, normalize },
) {
  const targets = mutationTargets(options, layout);
  const tested = testedSourceModules(options, layout);
  if (targets?.length === 0 && tested.modules.length === 0) return [];
  const mutationScope = { targets: targets ?? [], testedModules: tested.modules };
  const head = await mutationReport(
    options,
    targets && mutationTargetsWithTestedModules(targets, tested.modules),
  );
  if (head.skipped !== undefined) return head.skipped;
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
