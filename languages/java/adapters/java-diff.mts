import path from 'node:path';
import {
  testFailuresOf,
  unknownOnBaseFor,
} from '../../../core/diff/comparison/base-red/unknown-base.mjs';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readRemovesTests } from '../../../core/diff/git/patches/test-removal.mjs';
import { readRenameMap } from '../../../core/diff/git/patches/project-moves.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { javaRouteRule } from './java-policy.mjs';
import { withoutFollowedImports } from './imports/followed-imports.mts';
import { withoutGeneratedSources } from './generated/generated-sources.mjs';
import { withoutOverlaps } from './overlaps/static-overlaps.mts';
import { withJavaColumns } from './reporting/columns/java-columns.mts';
import { sourceTextReader } from './reporting/function-locator.mjs';
import { withTestsFailures } from './red-base/tests-failed.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';
import { withProjectSourceRules } from './regexes/regex-defects.mts';
import { mutationPlanOf } from '../builds/change-scope/mutation-plan.mts';
import { buildFindings } from './collect/build-findings.mts';
import {
  type JavaFinding,
  type JavaPolicy,
  callUntyped,
  findingsOf,
} from './typed/java-values.mts';
import type { JavaRunOptions } from './typed/java-run-options.mts';
import { fieldOf, fieldsOf, textOf } from '../../../shared/values/readers.mts';

type Comparison = { readonly mergeBaseSha: string; readonly headSha: string };
type SnapshotRequest = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly comparison: Comparison;
  readonly options: JavaRunOptions;
  readonly policy: JavaPolicy | undefined;
  readonly warn: (message: string) => void;
};
type ComparedSnapshots = {
  readonly notes: readonly JavaFinding[];
  readonly baseFindings: readonly JavaFinding[];
  readonly headFindings: readonly JavaFinding[];
};
type DiffRange = Comparison & {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
};
type Outcome = { readonly newFindings: readonly JavaFinding[]; readonly [field: string]: unknown };
type EnforcedOutcome = Outcome & {
  readonly newEnforceable: JavaFinding[];
  readonly failed: boolean;
};
type JavaDiffRequest = JavaRunOptions & {
  readonly repositoryRoot: string;
  readonly projectRelativePath?: string;
  readonly requestedBaseRef?: string | undefined;
};

export function collectJavaFindings(
  root: string,
  options: JavaRunOptions = {},
): readonly JavaFinding[] {
  return collectJavaReport(root, options).findings;
}

export function collectJavaReport(
  root: string,
  options: JavaRunOptions = {},
): { readonly findings: readonly JavaFinding[]; readonly imports: unknown } {
  const projectRoot = path.resolve(root);
  const plan = mutationPlanOf(projectRoot, options);
  const { findings: collected, imports, testsFailures } = buildFindings(projectRoot, plan.options);
  const findings = plan.findings(collected);
  const preset = options.policy?.preset ?? 'java';
  const readSource = sourceTextReader(projectRoot);
  const report: unknown = parseAnalyzerReport(
    { findings: withJavaColumns(findings, { projectRoot, policy: options.policy, readSource }) },
    preset,
  );
  const parsed = findingsOf(fieldOf(report, 'findings'));
  const policed = callUntyped(
    applyFindingPolicy,
    withoutFollowedImports(
      withProjectSourceRules(findingsOf(withoutGeneratedSources(parsed, projectRoot)), projectRoot),
      options.policy?.conventions,
      readSource,
    ),
    { ...options.policy, inventoryTool: preset, routeRule: javaRouteRule },
    options.resolveOverlaps ??
      ((reported: readonly JavaFinding[]) => withoutOverlaps(reported, { readSource })),
  );
  return {
    findings: findingsOf(callUntyped(withTestsFailures, policed, preset, testsFailures)),
    imports,
  };
}

function snapshotsOf(value: unknown): ComparedSnapshots {
  return {
    notes: findingsOf(fieldOf(value, 'notes')),
    baseFindings: findingsOf(fieldOf(value, 'baseFindings')),
    headFindings: findingsOf(fieldOf(value, 'headFindings')),
  };
}

function collectBothSnapshots({
  repositoryRoot,
  projectRelativePath,
  comparison,
  options,
  policy,
  warn,
}: SnapshotRequest): ComparedSnapshots {
  const head = { commitSha: comparison.headSha, warn };
  const snapshots: unknown = withTemporaryWorktree(
    repositoryRoot,
    head,
    (headWorktree: string): unknown => {
      const policyRoot = path.join(headWorktree, projectRelativePath);
      function collectIn(
        worktreeRoot: string,
        snapshot: string,
        extra: JavaPolicy = {},
      ): readonly JavaFinding[] {
        return collectJavaFindings(path.join(worktreeRoot, projectRelativePath), {
          ...options,
          policy: { ...policy, snapshot, policyRoot, ...extra },
        });
      }
      const compared: unknown = withTemporaryWorktree(
        repositoryRoot,
        { commitSha: comparison.mergeBaseSha, warn },
        (baseWorktree: string): ComparedSnapshots => {
          const collectedBase = collectIn(baseWorktree, 'base');
          const headFindings = collectIn(headWorktree, 'head', {
            baselineRoot: path.join(baseWorktree, projectRelativePath),
          });
          const notes = findingsOf(testFailuresOf({ findings: collectedBase }));
          return {
            notes,
            baseFindings: collectedBase.filter((finding) => !notes.includes(finding)),
            headFindings,
          };
        },
      );
      return compared;
    },
  );
  return snapshotsOf(snapshots);
}

function withEnforceable(outcome: Outcome): EnforcedOutcome {
  const newEnforceable = outcome.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  const failed =
    newEnforceable.length > 0 ||
    outcome.newFindings.some((finding) => finding.classification === 'tool-error');
  return { ...outcome, newEnforceable, failed };
}

function compareSnapshots(
  range: DiffRange,
  { notes, baseFindings, headFindings }: ComparedSnapshots,
): Readonly<Record<string, unknown>> {
  const testsRemoved: unknown = readRemovesTests(range);
  const touchedCode = {
    changedLines: readChangedLines(range),
    isStrictRule: isJavaTouchedRule,
    testsRemoved,
  };
  return fieldsOf(
    compareFindings({
      baseFindings,
      headFindings,
      baseToHeadRenames: readRenameMap(range),
      touchedCode,
      unknownOnBase: unknownOnBaseFor(notes, touchedCode),
    }),
  );
}

export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  gradle,
  maven,
  spawn,
  initScript,
  policy,
}: JavaDiffRequest): EnforcedOutcome {
  const resolved: unknown = resolveComparison(repositoryRoot, requestedBaseRef);
  const comparison = {
    ...fieldsOf(resolved),
    mergeBaseSha: textOf(fieldOf(resolved, 'mergeBaseSha')),
    headSha: textOf(fieldOf(resolved, 'headSha')),
  };
  const warnings: string[] = [];
  const snapshots = collectBothSnapshots({
    repositoryRoot,
    projectRelativePath,
    comparison,
    options: { gradle, maven, spawn, initScript },
    policy,
    warn: (message) => warnings.push(message),
  });
  const range = {
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  };
  const result = compareSnapshots(range, snapshots);
  return withEnforceable({
    comparison,
    ...result,
    newFindings: findingsOf(result['newFindings']),
    notes: snapshots.notes,
    warnings,
  });
}
