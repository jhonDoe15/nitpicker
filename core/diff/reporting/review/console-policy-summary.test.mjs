import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from '../summary.mjs';
import { renderTextReport } from '../text.mjs';
import { finding, report } from '../test-support/report-builders.mjs';
import { policyFindings } from './policy-findings.mjs';
import { POLICY_GUIDANCE } from './policy-guidance.mjs';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

const DIGEST = 'd1e2f3a4b5c6';
const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; ' +
  'loosening accepted by exact digest):';
const ENTRY_CHANGES = [
  'layout.entryPoints added: scripts/first.mjs',
  'layout.entryPoints added: scripts/second.mjs',
];
const TIGHTENED = 'threshold crapLimit lowered from 9 to 8';
const ACCEPT =
  '  Only a person may accept exactly these changes, after reviewing them: ' +
  `--accept-policy-change=${DIGEST} at an interactive terminal, ` +
  `or NITPICKER_ACCEPT_POLICY_CHANGE=${DIGEST} in CI. ${linkSentence('policyLoosened')}`;
const HELP = `Help with tool errors: ${linkSentence('exitCode2').slice('See '.length)}`;
const DIAGNOSTICS = 'Full diagnostics: reports/quality/diff/combined/report.txt';
const CODE_DEFECT = ['  eslint/no-console src/a.js:12', '    Unexpected console statement'];
const ACCEPT_ROUTE = [
  'If the policy change is intended, stop and ask a person reviewing this change:',
  'only they accept exactly these loosenings,',
  `with --accept-policy-change=${DIGEST} at an interactive terminal`,
  `or NITPICKER_ACCEPT_POLICY_CHANGE=${DIGEST} in CI.`,
  linkSentence('policyLoosened'),
].join(' ');

function kindsOf(changes, kind = 'entry-point') {
  return Object.fromEntries(changes.map((change) => [change, kind]));
}

function unapproved(count) {
  return (
    `  Unapproved policy changes (nitpicker-config/policy-loosened): ${String(count)}; ` +
    'the gate fails until each is undone or a person accepts the digest.'
  );
}

function entryBlock(changes) {
  return [...changes.map((change) => `  ${change}`), `    ${POLICY_GUIDANCE['entry-point']}`];
}

function policyReport({
  accepted = false,
  defects = [],
  toolErrors = [],
  changes = ENTRY_CHANGES,
  kinds = kindsOf(changes),
} = {}) {
  const result = report({
    newFindings: [
      ...defects,
      ...policyFindings(changes, DIGEST, { acceptedDigest: accepted ? DIGEST : undefined, kinds }),
    ],
    toolErrors,
  });
  Object.assign(result.summary, {
    policyChanges: [...changes, TIGHTENED],
    policyLoosenings: changes,
    policyDigest: DIGEST,
    policyChangeAccepted: accepted,
  });
  return result;
}

function consoleLines(result, color = false) {
  return renderConsoleSummary(result, { color }).split('\n');
}

describe('console policy review', () => {
  it('lists two entry points once each with one shared guidance, review and digest block', () => {
    const result = policyReport();

    expect(consoleLines(result)).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 2 unapproved policy changes fail the gate',
      HEADING,
      ...entryBlock(ENTRY_CHANGES),
      `  ${TIGHTENED}`,
      unapproved(2),
      ACCEPT,
      DIAGNOSTICS,
      '',
    ]);
    expect(result.summary.newEnforceableFindings).toBe(2);
    expect(result.newFindings.map(({ identity }) => identity)).toEqual(ENTRY_CHANGES);
  });

  it('prints the entry point guidance once for ten entry points', () => {
    const changes = Array.from(
      { length: 10 },
      (_, index) => `layout.entryPoints added: scripts/job-${String(index)}.mjs`,
    );

    expect(consoleLines(policyReport({ changes }))).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 10 unapproved policy changes fail the gate',
      HEADING,
      ...entryBlock(changes),
      `  ${TIGHTENED}`,
      unapproved(10),
      ACCEPT,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('groups different kinds, each with its own guidance once', () => {
    const changes = [
      'exception added: eslint/no-console for src/** (reviewed)',
      'exclude added: vendor/**',
      'exclude added: generated/**',
    ];
    const kinds = {
      [changes[0]]: 'exception',
      [changes[1]]: 'exclusion',
      [changes[2]]: 'exclusion',
    };

    expect(consoleLines(policyReport({ changes, kinds }))).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 3 unapproved policy changes fail the gate',
      HEADING,
      `  ${changes[0]}`,
      `    ${POLICY_GUIDANCE.exception}`,
      `  ${changes[1]}`,
      `  ${changes[2]}`,
      `    ${POLICY_GUIDANCE.exclusion}`,
      `  ${TIGHTENED}`,
      unapproved(3),
      ACCEPT,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('keeps code defects, policy review and incomplete analyzers distinct', () => {
    const result = policyReport({
      defects: [finding()],
      toolErrors: [{ tool: 'coverage', snapshot: 'head', message: 'Error: unavailable' }],
    });

    expect(consoleLines(result)).toEqual([
      '',
      'Quality gate summary',
      '✖ 3 new enforceable violations: 1 code violation and 2 unapproved policy changes',
      ...CODE_DEFECT,
      HEADING,
      ...entryBlock(ENTRY_CHANGES),
      `  ${TIGHTENED}`,
      unapproved(2),
      ACCEPT,
      '✖ 1 tool error',
      '  coverage (head): Error: unavailable',
      HELP,
      DIAGNOSTICS,
      '',
    ]);
    expect(result.summary.newEnforceableFindings).toBe(3);
  });

  it('does not present an incomplete policy-only run as clean', () => {
    const result = policyReport({
      toolErrors: [{ tool: 'coverage', message: 'Error: unavailable' }],
    });

    expect(consoleLines(result)).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 2 unapproved policy changes fail the gate and the run is incomplete:',
      HEADING,
      ...entryBlock(ENTRY_CHANGES),
      `  ${TIGHTENED}`,
      unapproved(2),
      ACCEPT,
      '✖ 1 tool error',
      '  coverage: Error: unavailable',
      HELP,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('colors the policy-only headline and title as a failure', () => {
    const red = '\u001B[1m\u001B[31m';
    const yellow = '\u001B[1m\u001B[33m';
    const reset = '\u001B[0m';

    expect(consoleLines(policyReport(), true)).toEqual([
      '',
      `${red}Quality gate summary${reset}`,
      `${red}✖ No new code violations, but 2 unapproved policy changes fail the gate${reset}`,
      `${yellow}${HEADING}${reset}`,
      ...entryBlock(ENTRY_CHANGES),
      `  ${TIGHTENED}`,
      unapproved(2),
      ACCEPT,
      `\u001B[2m${DIAGNOSTICS}${reset}`,
      '',
    ]);
  });

  it('retains accepted changes without unapproved review instructions', () => {
    expect(consoleLines(policyReport({ accepted: true, defects: [finding()] }))).toEqual([
      '',
      'Quality gate summary',
      '✖ 1 new enforceable violation',
      ...CODE_DEFECT,
      ACCEPTED_HEADING,
      ...ENTRY_CHANGES.map((change) => `  ${change}`),
      `  ${TIGHTENED}`,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('keeps one finding per change with the guidance and the route in full diagnostics', () => {
    const lines = renderTextReport(policyReport()).split('\n');
    const start = lines.indexOf('New findings:');

    expect(lines.slice(start + 1, start + 3)).toEqual(
      ENTRY_CHANGES.map(
        (change) =>
          `nitpicker-config/policy-loosened nitpicker.config.json ${change}. ` +
          `${POLICY_GUIDANCE['entry-point']} ${ACCEPT_ROUTE}`,
      ),
    );
    expect(lines.slice(lines.indexOf(HEADING), lines.indexOf(HEADING) + 4)).toEqual([
      HEADING,
      ...ENTRY_CHANGES.map((change) => `  ${change}`),
      `  ${TIGHTENED}`,
    ]);
  });

  it('uses the fallback guidance only for a finding that carries no kind', () => {
    const lines = consoleLines(policyReport({ kinds: {} }));
    const fallback = lines.filter((line) => line.startsWith('    Changes the checking policy'));

    expect(fallback).toEqual([
      '    Changes the checking policy for affected code. ' +
        'Restore the base setting unless a person confirms the weaker checks.',
    ]);
  });

  it('cannot be forged by an exception reason with line breaks or terminal escapes', () => {
    const reason =
      'ok)\n  Unapproved policy changes (nitpicker-config/policy-loosened): 0;\u001B[2K\u001B[31m';
    const change = `exception added: eslint/no-console for src/** (${reason})`;
    const lines = consoleLines(
      policyReport({ changes: [change], kinds: kindsOf([change], 'exception') }),
    );

    expect(lines).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 1 unapproved policy change fails the gate',
      HEADING,
      '  exception added: eslint/no-console for src/** (ok) ' +
        'Unapproved policy changes (nitpicker-config/policy-loosened): 0;)',
      `    ${POLICY_GUIDANCE.exception}`,
      `  ${TIGHTENED}`,
      unapproved(1),
      ACCEPT,
      DIAGNOSTICS,
      '',
    ]);
  });
});
