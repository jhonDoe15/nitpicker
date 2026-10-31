import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KOTLIN_REPORTS } from './kotlin-report-names.mjs';

const EMPTY_REPORTS = {
  metrics: '{"functions":[],"files":[]}',
  facts: '{"files":[]}',
  mutationFacts: '{"files":[]}',
};

const BUILD_TOOLS = [
  {
    name: 'Gradle',
    file: new URL('../../../gradle/nitpicker.init.gradle', import.meta.url),
    start: "tasks.register('nitpickerKotlinPsi')",
  },
];

const noKotlinBranch = ({ file, start }) => {
  const text = readFileSync(file, 'utf8');
  const task = text.indexOf(start);
  const branch = text.indexOf('isEmpty()', task);
  return text.slice(task, text.indexOf('return', branch));
};

describe.each(BUILD_TOOLS)(
  '$name writes every Kotlin report when there are no Kotlin files',
  (tool) => {
    const branch = noKotlinBranch(tool);

    it.each(Object.keys(KOTLIN_REPORTS))('%s', (report) => {
      expect(branch).toContain(KOTLIN_REPORTS[report]);
    });

    it.each([...new Set(Object.values(EMPTY_REPORTS))])(
      'writes %s once per report that takes it',
      (empty) => {
        const reports = Object.values(EMPTY_REPORTS).filter((value) => value === empty);
        expect(branch.split(`'${empty}'`).length - 1).toBe(reports.length);
      },
    );
  },
);
