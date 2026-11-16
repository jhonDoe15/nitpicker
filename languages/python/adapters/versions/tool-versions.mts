import { jscpdVersion as untypedJscpdVersion } from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import { importLinterEnabled } from '../analysis/python-import-linter.mts';
import { probeVersion } from '../execution/python-process.mts';
import { pytestLabel, testRunnerLabel } from '../execution/python-test-runner.mts';
import { MUTMUT_VERSION_PROBE } from '../mutation/python-mutation.mts';
import { mutationRunnerLabels } from '../mutation/test-run/python-mutation-runner.mts';
import { resolveTypeChecker } from '../python-types.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';

const jscpdVersion: () => string = untypedJscpdVersion;
const VERSION_FLAG = '--version';
const BLACK = 'black';
const IMPORT_LINTER_METADATA = [
  'python',
  '-I',
  '-c',
  'import importlib.metadata as m; print(m.version("import-linter"))',
];

function typeCheckerVersion(context: ToolContext): string {
  const checker = resolveTypeChecker(context);
  return checker === undefined
    ? 'types@missing'
    : `${checker}@${probeVersion(context, [checker, VERSION_FLAG])}`;
}

function importLinterVersion(context: ToolContext): string[] {
  const { importLinter } = context.project;
  if (!importLinterEnabled(context.projectRoot, importLinter)) {
    return [];
  }
  const installed = probeVersion(context, IMPORT_LINTER_METADATA);
  const version =
    installed === 'missing' ? probeVersion(context, ['lint-imports', VERSION_FLAG]) : installed;
  return [`import-linter@${version}`];
}

export function toolVersions(context: ToolContext): string {
  const { formatter } = context.project;
  return [
    `ruff@${probeVersion(context, ['ruff', VERSION_FLAG])}`,
    ...(formatter === BLACK ? [`black@${probeVersion(context, [BLACK, VERSION_FLAG])}`] : []),
    typeCheckerVersion(context),
    `coverage@${probeVersion(context, ['coverage', VERSION_FLAG])}`,
    testRunnerLabel(context),
    `jscpd@${jscpdVersion()}`,
    ...importLinterVersion(context),
  ].join(';');
}

export function mutationVersions(context: ToolContext): string {
  return [
    `mutmut@${probeVersion(context, MUTMUT_VERSION_PROBE)}`,
    pytestLabel(context),
    ...mutationRunnerLabels(context),
  ].join(';');
}
