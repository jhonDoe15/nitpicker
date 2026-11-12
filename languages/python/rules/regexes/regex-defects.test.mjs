import { describe, expect, it } from 'vitest';
import { ingestRulesReport } from '../../ingest/rules-report.mjs';
import { withHint } from '../rule-hints.mjs';

function site(pattern, flags = '') {
  return {
    rule: 'regex-pattern',
    path: 'app/routes.py',
    subject: pattern,
    line: 3,
    data: { pattern, flags },
  };
}

function findings(sites) {
  return ingestRulesReport(JSON.stringify(sites)).map((finding) => withHint(finding));
}

const INERT =
  'That part of the pattern never changes what it matches: remove it, or rewrite it to match what was meant.';
const ROUTE =
  'If this is intended, add {"rule":"regex-part-defect","paths":["app/routes.py"],"reason":"..."} ' +
  'to "python.exceptions" in nitpicker.config.json.';

describe('Python regex pattern defects', () => {
  it.each([
    ['a duplicate alternative', 'a|b|a', '', 'regex-part-defect'],
    ['a duplicate class member under re.A', '[\\w_]+', 'a', 'regex-part-defect'],
    ['a duplicate range under re.I', '[a-zA-Z]', 'i', 'regex-part-defect'],
    ['an inline flag', '(?i)[a-zA-Z]', '', 'regex-part-defect'],
    ['super-linear backtracking', '^(?:a*b+)*$', '', 'regex-backtracking'],
  ])('reports %s', (_name, pattern, flags, rule) => {
    expect(findings([site(pattern, flags)]).map((finding) => finding.rule)).toContain(rule);
  });

  it.each([
    ['a clean pattern', '^[a-z]+-\\d+$'],
    ['a Unicode \\d without re.A', '\\d|[0-9]'],
    ['a Unicode \\w without re.A', '[\\w_]+'],
    ['a named group', '(?P<id>a)|(?P=id)|a'],
    ['a verbose-only comment', '(?x)a|a  # twice'],
    ['a dollar before a newline', 'a$\\n|a$\\n'],
    ['a character above ASCII', 'é|é'],
  ])('leaves %s alone', (_name, pattern) => {
    expect(findings([site(pattern)])).toEqual([]);
  });

  it('describes the defect, names the fix and keeps other findings', () => {
    const other = { rule: 'shell-command', path: 'app/run.py', subject: 'os.system', line: 1 };
    const [defect, kept] = findings([site('a|b|a'), other]);

    expect(defect.message).toBe(
      `Unexpected duplicate alternative. This alternative can be removed. ${INERT} ${ROUTE}`,
    );
    expect(defect.allowedForm).toBe(INERT);
    expect(kept.rule).toBe('shell-command');
  });
});
