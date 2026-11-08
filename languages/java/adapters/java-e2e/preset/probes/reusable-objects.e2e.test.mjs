import { cpSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  preparePmdProbe,
  readPmdProbeFindings,
  runPmdProbe,
} from '../../test-support/pmd-probe.mjs';
import { exceptionRoute } from '../../../../../../shared/exceptions/rule-names.mjs';
import { appendSentence } from '../../../../../../shared/messages/exception-sentence.mjs';
import {
  REUSABLE_OBJECT_MESSAGE,
  REUSABLE_OBJECT_RULE,
} from '../../../../messages/reuse/reusable-objects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const PACKAGE = 'java/shop/reuse';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/reusable-objects');
const MARKER = new RegExp(`// violation: (?:\\w+, )*${REUSABLE_OBJECT_RULE}(?:, \\w+)*$`, 'u');
let root;
let findings;

function markedLines(role) {
  return readdirSync(fixtures)
    .flatMap((name) =>
      readFileSync(path.join(fixtures, name), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          MARKER.test(line) ? [`src/${role}/${PACKAGE}/${name}:${String(index + 1)}`] : [],
        ),
    )
    .sort();
}

function reportedLines(role) {
  return findings
    .filter(({ rule, path: file }) => rule === REUSABLE_OBJECT_RULE && file.startsWith(`src/${role}/`))
    .map(({ path: file, location }) => `${file}:${String(location.line)}`)
    .sort();
}

describe.skipIf(!enabled)('Shareable objects built on every call, in a project without Spring', () => {
  beforeAll(() => {
    root = preparePmdProbe('reusable-objects');
    for (const role of ['main', 'test']) {
      cpSync(fixtures, path.join(root, 'src', role, PACKAGE), { recursive: true });
    }
    runPmdProbe(root, gradle);
    findings = readPmdProbeFindings(root);
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it('reports the marked constructions from the main rule set, with no classpath', () => {
    expect(reportedLines('main')).toEqual(markedLines('main'));
    expect(reportedLines('main')).toHaveLength(12);
  });

  it('leaves test sources alone', () => {
    expect(reportedLines('test')).toEqual([]);
  });

  it('names the allowed forms and the exception route', () => {
    const first = findings.find(({ rule }) => rule === REUSABLE_OBJECT_RULE);

    expect(first?.message).toBe(
      appendSentence(
        REUSABLE_OBJECT_MESSAGE,
        exceptionRoute({ rule: `pmd/${REUSABLE_OBJECT_RULE}`, path: first?.path }),
      ),
    );
  });
});
