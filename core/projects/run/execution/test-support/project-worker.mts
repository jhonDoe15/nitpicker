import { fakeAnalyzer } from '../../../../command/test-support/cli-harness.mts';
import { runTasksInProcess } from '../../../../diff/execution/test-support/in-process-analyzers.mts';
import { workOnJob } from '../../../../project-job.mts';

await workOnJob({ analyzers: [fakeAnalyzer()], runTasks: runTasksInProcess });
