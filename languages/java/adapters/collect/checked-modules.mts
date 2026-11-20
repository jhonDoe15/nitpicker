import { readFinishedModules, readReportModules } from '../gradle-reports/report-modules.mts';
import {
  type FailedToolTasks,
  failedProjects,
} from '../gradle-wrapper/partial/failed-tool-tasks.mts';

type ReportPlace = {
  readonly reportBase: string;
  readonly preset: string;
  readonly projectRoot: string;
};
type ReportModules = ReturnType<typeof readReportModules>;

function finishedModules(
  failedTools: FailedToolTasks,
  { reportBase, preset }: ReportPlace,
): ReportModules | undefined {
  try {
    return readFinishedModules(reportBase, preset, failedProjects(failedTools));
  } catch (error) {
    if (failedTools.stoppedAfterMinutes === undefined) {
      throw error;
    }
    return undefined;
  }
}

export function checkedModules(failedTools: FailedToolTasks, place: ReportPlace): ReportModules {
  if (failedTools.tasks.length === 0 && failedTools.stoppedAfterMinutes === undefined) {
    return readReportModules(place.reportBase, place.preset, place.projectRoot);
  }
  const report = finishedModules(failedTools, place);
  if (report === undefined || report.modules.length === 0) {
    throw failedTools.error instanceof Error
      ? failedTools.error
      : new Error(`The ${place.preset} preset failed in every Gradle project`);
  }
  return report;
}
