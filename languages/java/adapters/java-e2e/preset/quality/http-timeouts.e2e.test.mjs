import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  preparePmdProbe,
  readPmdProbeFindings,
  runPmdProbe,
} from '../../test-support/pmd-probe.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const RULE = 'HttpWithoutTimeout';
const REMOTE = 'src/main/java/shop/remote';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/review-rules', REMOTE);
const MARKER = new RegExp(`// violation: ${RULE}$`, 'u');
let root;
let findings;

function markedLines(role) {
  return readdirSync(fixtures)
    .flatMap((name) =>
      readFileSync(path.join(fixtures, name), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          MARKER.test(line) ? [`src/${role}/java/shop/remote/${name}:${String(index + 1)}`] : [],
        ),
    )
    .sort();
}

function reportedLines(role) {
  return findings
    .filter(({ rule, path: file }) => rule === RULE && file.startsWith(`src/${role}/`))
    .map(({ path: file, location }) => `${file}:${String(location.line)}`)
    .sort();
}

describe.skipIf(!enabled)('HTTP calls without a timeout in a project without Spring', () => {
  beforeAll(() => {
    root = preparePmdProbe('http-timeouts', [
      [fixtures, REMOTE],
      [fixtures, 'src/test/java/shop/remote'],
    ]);
    runPmdProbe(root);
    findings = readPmdProbeFindings(root);
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it('reports the marked calls from the main rule set, with no classpath to resolve the clients', () => {
    expect(reportedLines('main')).toEqual(markedLines('main'));
    expect(reportedLines('main')).toHaveLength(14);
  });

  it('leaves test sources alone, where a test talks to a local fake', () => {
    expect(reportedLines('test')).toEqual([]);
  });

  it('names the allowed forms and the exception route', () => {
    const message = findings.find(({ rule }) => rule === RULE)?.message ?? '';

    expect(message).toMatch(/^Give the call a deadline: HttpRequest\.newBuilder\(uri\)\.timeout/u);
    expect(message).toContain(`{"rule":"pmd/${RULE}","paths":[`);
  });
});
