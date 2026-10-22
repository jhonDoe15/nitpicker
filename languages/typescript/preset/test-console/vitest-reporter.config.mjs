import { REPORT_VARIABLE, consoleEntry, writeReportFile } from './console-report.mjs';

function locate(entity) {
  if (entity === undefined) {
    return { file: '', test: '' };
  }
  if (entity.type === 'module') {
    return { file: entity.moduleId, test: '' };
  }
  return { file: entity.module.moduleId, test: entity.fullName };
}

export default function testConsoleReporter() {
  const entries = [];
  let vitest;
  return {
    onInit(context) {
      vitest = context;
    },
    onUserConsoleLog(log) {
      const entity = vitest.state.getReportedEntityById(log.taskId);
      if (
        log.type !== 'stderr' ||
        vitest.config.onConsoleLog?.(log.content, log.type, entity) === false
      ) {
        return;
      }
      const entry = consoleEntry({
        content: log.content,
        root: vitest.config.root,
        ...locate(entity),
      });
      if (entry !== undefined) {
        entries.push(entry);
      }
    },
    onTestRunEnd() {
      const reportPath = process.env[REPORT_VARIABLE];
      if (reportPath !== undefined && reportPath !== '') {
        writeReportFile(reportPath, entries);
      }
    },
  };
}
