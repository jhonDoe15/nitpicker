import { cpSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  preparePmdProbe,
  readPmdProbeFindings,
  runPmdProbe,
} from '../../test-support/pmd/pmd-probe.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/generic-names');
const RULES = new Set(['GenericTypeName', 'GenericPackageName']);
const MARKER = /\/\/ violation: (\w+)$/u;
let root;
let findings;

function markedLines() {
  return readdirSync(fixtures, { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .flatMap((name) =>
      readFileSync(path.join(fixtures, name), 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const rule = MARKER.exec(line)?.[1];
          return rule === undefined
            ? []
            : [`src/main/java/demo/${name}:${String(index + 1)} ${rule}`];
        }),
    )
    .sort();
}

describe.skipIf(!enabled)('generic type and package names', () => {
  beforeAll(() => {
    root = preparePmdProbe('generic-names');
    for (const role of ['main', 'test']) {
      cpSync(fixtures, path.join(root, 'src', role, 'java/demo'), { recursive: true });
    }
    runPmdProbe(root, gradle);
    findings = readPmdProbeFindings(root);
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it('reports each marked line in main sources and none in test sources', () => {
    const reported = findings
      .filter(({ rule }) => RULES.has(rule))
      .map(({ rule, path: file, location }) => `${file}:${String(location.line)} ${rule}`)
      .sort();

    expect(reported).toEqual(markedLines());
    expect(reported).toHaveLength(9);
  });

  it('names the allowed form and the exception route in every message', () => {
    const messages = findings.filter(({ rule }) => RULES.has(rule)).map(({ message }) => message);

    expect(messages.filter((message) => !message.includes('shared package'))).toEqual([]);
    expect(messages.filter((message) => !message.includes('An exception fits'))).toEqual([]);
  });
});
