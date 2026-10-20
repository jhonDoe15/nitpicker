import { REPORT_VARIABLE, consoleEntry, writeConsoleReport } from './console-report.mjs';
export { REPORT_VARIABLE, consoleMessagesOf } from './console-report.mjs';

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
      const { file, test } = locate(entity);
      const entry = consoleEntry(file, test, log.content, vitest.config.root);
      if (entry.messages.length > 0) {
        entries.push(entry);
      }
    },
    onTestRunEnd() {
      writeConsoleReport(process.env[REPORT_VARIABLE], entries);
    },
  };
}
