import { cpSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  preparePmdProbe,
  readPmdProbeFindings,
  runPmdProbe,
} from '../../test-support/pmd-probe.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/simpler-logic');
const SIMPLER_FORMS = {
  SimplifyBooleanReturns: ['is return c;', 'return c || x;', '!c && x'],
  SimplifyBooleanExpressions: ['x == true and x != false are x', 'x == false and x != true are !x'],
  SimplifiedTernary: ['c ? true : x is c || x', 'c ? x : false is c && x'],
  SimplifyConditional: ['x instanceof Foo is already false when x is null'],
  CollapsibleIfStatements: ['if (a) { if (b) { ... } } is if (a && b) { ... }'],
  LogicInversion: ['!(a == b) is a != b', '!(a < b) is a >= b'],
  ConfusingTernary: ['if (!c) A else B is if (c) B else A', '!c ? a : b is c ? b : a'],
  NegatedOperands: ['!a && !b is !(a || b)', '!a || !b is !(a && b)'],
};
const RULES = new Set(Object.keys(SIMPLER_FORMS));
const MARKER = /\/\/ violation: (\w+)$/u;
let root;
let findings;

function markedLines(role) {
  return readdirSync(fixtures)
    .flatMap((name) =>
      readFileSync(path.join(fixtures, name), 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const rule = MARKER.exec(line)?.[1];
          return rule === undefined
            ? []
            : [`src/${role}/java/demo/${name}:${String(index + 1)} ${rule}`];
        }),
    )
    .sort();
}

function reportedLines(role) {
  return findings
    .filter(({ rule, path: file }) => RULES.has(rule) && file.startsWith(`src/${role}/`))
    .map(({ rule, path: file, location }) => `${file}:${String(location.line)} ${rule}`)
    .sort();
}

describe.skipIf(!enabled)('boolean logic with an exact simpler form', () => {
  beforeAll(() => {
    root = preparePmdProbe('simpler-logic');
    for (const role of ['main', 'test']) {
      cpSync(fixtures, path.join(root, 'src', role, 'java/demo'), { recursive: true });
    }
    runPmdProbe(root, gradle);
    findings = readPmdProbeFindings(root);
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it.each(['main', 'test'])(
    'reports each marked line in %s sources, and none of the simpler forms',
    (role) => {
      expect(reportedLines(role)).toEqual(markedLines(role));
      expect(reportedLines(role)).toHaveLength(18);
    },
  );

  it.each(Object.entries(SIMPLER_FORMS))(
    'prints the simpler form in every %s message',
    (rule, forms) => {
      const messages = findings
        .filter((finding) => finding.rule === rule)
        .map(({ message }) => message);

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.filter((message) => !forms.every((form) => message.includes(form)))).toEqual(
        [],
      );
    },
  );
});
