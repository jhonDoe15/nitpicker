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

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const RULESET = path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml');
const RULE = 'ConfigurationReadOutsideCompositionRoot';
const SETTINGS = 'java/shop/settings';
const fixtures = path.resolve(
  import.meta.dirname,
  '../../fixtures/configuration-reads/src/main',
  SETTINGS,
);
const MARKER = new RegExp(`// violation: (?:\\w+, )*${RULE}(?:, \\w+)*$`, 'u');
let root;
let findings;

function markedLines(role) {
  return readdirSync(fixtures, { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .flatMap((name) =>
      readFileSync(path.join(fixtures, name), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          MARKER.test(line)
            ? [`src/${role}/${SETTINGS}/${name.split(path.sep).join('/')}:${String(index + 1)}`]
            : [],
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

describe.skipIf(!enabled)('configuration reads outside the composition root without Spring', () => {
  beforeAll(() => {
    root = preparePmdProbe('configuration-reads');
    for (const role of ['main', 'test']) {
      cpSync(fixtures, path.join(root, 'src', role, SETTINGS), { recursive: true });
    }
    runPmdProbe(root, gradle);
    findings = readPmdProbeFindings(root);
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it('reports the marked reads and leaves main, modules, factories and typed configuration alone', () => {
    expect(reportedLines('main')).toEqual(markedLines('main'));
    expect(reportedLines('main')).toHaveLength(11);
  });

  it('leaves test sources alone, where a test sets up its own process', () => {
    expect(reportedLines('test')).toEqual([]);
  });

  it('names the allowed forms and the exception route', () => {
    const ruleset = readFileSync(RULESET, 'utf8');
    const rule = ruleset.slice(ruleset.indexOf(`<rule name="${RULE}"`));
    const message = /message="([^"]*)"/u.exec(rule)[1];
    const first = findings.find(({ rule: name }) => name === RULE);

    expect(first?.message).toBe(
      appendSentence(message, exceptionRoute({ rule: `pmd/${RULE}`, path: first?.path })),
    );
  });
});
