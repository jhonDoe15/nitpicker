import { format } from 'node:util';
import {
  REPORT_VARIABLE,
  consoleEntry,
  writeConsoleReport,
} from '../../../preset/test-console/console-report.mjs';

export function consoleHooks(environment, root) {
  const reportPath = environment[REPORT_VARIABLE];
  if (reportPath === undefined) {
    return {};
  }
  const entries = [];
  const originals = new Map();
  const current = { file: '', test: '' };
  for (const method of ['warn', 'error']) {
    const original = console[method];
    originals.set(method, original);
    console[method] = (...args) => {
      entries.push(consoleEntry(current.file, current.test, format(...args), root));
      original.apply(console, args);
    };
  }
  return {
    beforeEach() {
      current.file = this.currentTest.file ?? '';
      current.test = this.currentTest.fullTitle();
    },
    afterEach() {
      current.test = '';
    },
    afterAll() {
      for (const [method, original] of originals) {
        console[method] = original;
      }
      writeConsoleReport(reportPath, entries);
    },
  };
}
