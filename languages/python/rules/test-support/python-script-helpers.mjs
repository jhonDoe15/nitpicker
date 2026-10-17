import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

function rawFindingsOf(roots, files, { settings = {}, hidden = [] }) {
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
  return JSON.parse(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8')).filter(
    ({ rule }) => !hidden.includes(rule),
  );
}

function specFiles(spec) {
  if (typeof spec === 'string') {
    return [['mod.py', spec]];
  }
  return spec.files === undefined
    ? [[spec.file ?? 'mod.py', spec.code]]
    : Object.entries(spec.files);
}

function caseFiles(cases) {
  return Object.fromEntries(
    Object.values(cases).flatMap((spec, index) =>
      specFiles(spec).map(([file, code]) => [`k${String(index)}/${file}`, code]),
    ),
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

export function createScripts({ hidden = [] } = {}) {
  const roots = [];

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function reportOf(files, settings) {
    return rawFindingsOf(roots, files, { settings, hidden });
  }

  function findingsOf(files, settings) {
    return reportOf(files, settings).map(
      ({ rule, path: file, subject, line }) => `${rule} ${file}:${String(line)} ${subject}`,
    );
  }

  function verdicts(cases, settings) {
    const found = rawFindingsOf(roots, caseFiles(cases), { settings, hidden });
    return verdictsFrom(found, Object.keys(cases));
  }

  function outcomes(rows, settings) {
    const cases = Object.fromEntries(rows.map(([name, code]) => [name, code]));
    const expected = Object.fromEntries(rows.map(([name, , found]) => [name, found]));
    return [verdicts(cases, settings), expected];
  }

  function single(code, file = 'src/mod.py') {
    return findingsOf({ [file]: code });
  }

  return { cleanup, outcomes, findingsOf, reportOf, single, verdicts };
}
