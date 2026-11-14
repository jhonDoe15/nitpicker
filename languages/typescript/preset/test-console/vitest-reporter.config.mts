import {
  type ConsoleEntry,
  REPORT_VARIABLE,
  consoleEntry,
  writeReportFile,
} from './console-report.mts';

type ModuleEntity = { readonly type: 'module'; readonly moduleId: string };

type ReportedEntity =
  | ModuleEntity
  | {
      readonly type: 'test' | 'suite';
      readonly fullName: string;
      readonly module: { readonly moduleId: string };
    };

type VitestReporter = {
  readonly onInit: (context: VitestContext) => void;
  readonly onUserConsoleLog: (log: { type: string; content: string; taskId?: string }) => void;
  readonly onTestRunEnd: () => void;
};

type VitestContext = {
  readonly state: { getReportedEntityById(id: string | undefined): ReportedEntity | undefined };
  readonly config: {
    readonly root: string;
    readonly onConsoleLog?:
      ((content: string, type: string, entity: ReportedEntity | undefined) => boolean) | undefined;
  };
};

function locate(entity: ReportedEntity | undefined): { file: string; test: string } {
  if (entity === undefined) {
    return { file: '', test: '' };
  }
  if (entity.type === 'module') {
    return { file: entity.moduleId, test: '' };
  }
  return { file: entity.module.moduleId, test: entity.fullName };
}

export default function testConsoleReporter(): VitestReporter {
  const entries: ConsoleEntry[] = [];
  let vitest: VitestContext | undefined;
  return {
    onInit(context: VitestContext) {
      vitest = context;
    },
    onUserConsoleLog(log: { type: string; content: string; taskId?: string }) {
      if (vitest === undefined) {
        return;
      }
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
