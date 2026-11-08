import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRules, readRegexSites } from '../../../adapters/analysis/python-ast-rules.mjs';
import { createToolContext } from '../../../adapters/python-tools.mjs';
import { ingestRulesReport } from '../../../ingest/rules-report.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function folder(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function defects(code) {
  const projectRoot = folder('nitpicker-regex-project-');
  const reportRoot = folder('nitpicker-regex-report-');
  writeFileSync(path.join(projectRoot, 'mod.py'), `import re\n\n\n${code}\n`);
  checkRules(
    createToolContext({
      projectRoot,
      liveRoot: projectRoot,
      settings: { environment: 'path', sourceRoots: ['.'] },
      reportRoot,
    }),
  );
  return ingestRulesReport(readRegexSites(reportRoot)).map(
    ({ rule, location, subject }) => `${rule}:${String(location.line)} ${subject.split(' ')[0]}`,
  );
}

describe.skipIf(!enabled)('regex-part-defect', () => {
  it.each([
    ['re.compile', 'WORD = re.compile(r"a|b|a")', 'regexp/no-dupe-disjunctions'],
    [
      're.match with a string and re.ASCII',
      'def f(s):\n    return re.match("[\\\\w_]+", s, re.ASCII)',
      'regexp/no-dupe-characters-character-class',
    ],
    ['flags=0', 'WORD = re.compile(r"a|b|a", flags=0)', 'regexp/no-dupe-disjunctions'],
    ['re.NOFLAG', 'WORD = re.compile(r"a|b|a", re.NOFLAG)', 'regexp/no-dupe-disjunctions'],
    ['re.sub', 'def f(s):\n    return re.sub(r"x{1}", "", s)', 'regexp/no-useless-quantifier'],
    [
      're.I as a keyword',
      'WORD = re.compile(r"[a-zA-Z]", flags=re.I)',
      'regexp/no-dupe-characters-character-class',
    ],
    [
      're.I | re.M in position',
      'def f(s):\n    return re.search(r"[a-zA-Z]", s, re.I | re.M)',
      'regexp/no-dupe-characters-character-class',
    ],
  ])('reports %s', (_name, code, regexpRule) => {
    const line = code.includes('\n') ? 5 : 4;
    expect(defects(code)).toEqual([`regex-part-defect:${String(line)} ${regexpRule}`]);
  });

  it.each([
    ['re.VERBOSE', 'WORD = re.compile(r"a|a", re.VERBOSE)'],
    ['a flags variable', 'def f(flags):\n    return re.compile(r"a|a", flags)'],
    ['an f-string', 'def f(x):\n    return re.compile(f"{x}|a|a")'],
    ['a named group', 'WORD = re.compile(r"(?P<a>x)|(?P<b>x)")'],
    ['bytes', 'WORD = re.compile(rb"a|a")'],
    ['a Unicode class', 'WORD = re.compile(r"\\d|[0-9]")'],
    ['the regex module', 'import regex\nWORD = regex.compile(r"a|a")'],
  ])('leaves %s alone', (_name, code) => {
    expect(defects(code)).toEqual([]);
  });
});
