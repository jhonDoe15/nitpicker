import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { RULES_REPORT, checkRules } from '../../adapters/analysis/python-ast-rules.mjs';
import { createToolContext } from '../../adapters/python-tools.mjs';

function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${file} is outside ${root}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function rawFindingsOf(roots, files, settings = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-script-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-report-')));
  roots.push(root, reportRoot);
  writeFiles(root, files);
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', sourceRoots: ['.'], ...settings },
    reportRoot,
  });
  checkRules(context);
  return JSON.parse(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8'));
}

function caseFiles(cases) {
  return Object.fromEntries(
    Object.entries(cases).map(([name, spec], index) => {
      const { file = 'mod.py', code } = typeof spec === 'string' ? { code: spec } : spec;
      return [`k${String(index)}/${file}`, code];
    }),
  );
}

function verdictsFrom(found, names) {
  return Object.fromEntries(
    names.map((name, index) => [
      name,
      found
        .filter(({ path: file }) => file.startsWith(`k${String(index)}/`))
        .map(({ rule, line, subject }) => `${rule}:${String(line)} ${subject}`),
    ]),
  );
}

export function createScripts() {
  const roots = [];

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function findingsOf(files, settings) {
    return rawFindingsOf(roots, files, settings).map(
      ({ rule, path: file, subject, line }) => `${rule} ${file}:${String(line)} ${subject}`,
    );
  }

  function verdicts(cases, settings) {
    const found = rawFindingsOf(roots, caseFiles(cases), settings);
    return verdictsFrom(found, Object.keys(cases));
  }

  function expectVerdicts(rows, settings) {
    const cases = Object.fromEntries(rows.map(([name, code]) => [name, code]));
    const expected = Object.fromEntries(rows.map(([name, , found]) => [name, found]));
    expect(verdicts(cases, settings)).toEqual(expected);
  }

  function single(code, file = 'src/mod.py') {
    return findingsOf({ [file]: code });
  }

  return { cleanup, expectVerdicts, findingsOf, single, verdicts };
}
