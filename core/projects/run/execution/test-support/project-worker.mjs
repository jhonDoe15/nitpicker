import { fakeAnalyzer } from '../../../../command/test-support/fake-analyzers.mjs';
import { runTasksInProcess } from '../../../../diff/execution/test-support/in-process-analyzers.mjs';
import { workOnJob } from '../project-job.mts';

await workOnJob({ analyzers: [fakeAnalyzer()], runTasks: runTasksInProcess });
