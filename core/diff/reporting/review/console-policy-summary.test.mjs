import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from '../summary.mjs';
import { renderTextReport } from '../text.mjs';
import { finding, report } from '../test-support/report-builders.mjs';
import { policyFindings } from './policy-findings.mjs';
import { POLICY_GUIDANCE } from './policy-guidance.mjs';

const DIGEST = 'd1e2f3a4b5c6';
const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; ' +
  'loosening accepted by exact digest):';
const ENTRY_CHANGES = [
  'layout.entryPoints added: scripts/first.mjs',
  'layout.entryPoints added: scripts/second.mjs',
];
const KINDS = Object.fromEntries(ENTRY_CHANGES.map((change) => [change, 'entry-point']));
const TIGHTENED = 'threshold crapLimit lowered from 9 to 8';
const UNAPPROVED =
  '  Unapproved policy changes (nitpicker-config/policy-loosened): 2; ' +
  'the gate fails until each is undone or a person accepts the digest.';
const ACCEPT =
  '  Only a person may accept exactly these changes, after reviewing them: ' +
  `--accept-policy-change=${DIGEST} at an interactive terminal, ` +
  `or NITPICKER_ACCEPT_POLICY_CHANGE=${DIGEST} in CI.`;
const DIAGNOSTICS = 'Full diagnostics: reports/quality/diff/combined/report.txt';
const ENTRY_BLOCK = [
  '  layout.entryPoints added: scripts/first.mjs',
  '  layout.entryPoints added: scripts/second.mjs',
  `    ${POLICY_GUIDANCE['entry-point']}`,
];

function policyReport({
  accepted = false,
  defects = [],
  toolErrors = [],
  changes = ENTRY_CHANGES,
  kinds = KINDS,
} = {}) {
  const result = report({
    newFindings: [
      ...defects,
      ...policyFindings(changes, DIGEST, accepted ? DIGEST : undefined, kinds),
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

function consoleLines(result) {
  return renderConsoleSummary(result, { color: false }).split('\n');
}

describe('console policy review', () => {
  it('lists two entry points once each with one shared guidance, review and digest block', () => {
    const result = policyReport();
    const text = renderConsoleSummary(result, { color: false });

    expect(text.split('\n')).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 2 unapproved policy changes fail the gate',
      HEADING,
      ...ENTRY_BLOCK,
      `  ${TIGHTENED}`,
      UNAPPROVED,
      ACCEPT,
      DIAGNOSTICS,
      '',
    ]);
    expect(text.match(/scripts\/first\.mjs/gu)).toHaveLength(1);
    expect(text.match(/scripts\/second\.mjs/gu)).toHaveLength(1);
    expect(text.match(/dead-code check treats them as used/gu)).toHaveLength(1);
    expect(text).not.toContain('✓');
    expect(result.summary.newEnforceableFindings).toBe(2);
    expect(result.newFindings.map(({ identity }) => identity)).toEqual(ENTRY_CHANGES);
  });

  it('prints the entry point guidance once for ten entry points', () => {
    const changes = Array.from(
      { length: 10 },
      (_, index) => `layout.entryPoints added: scripts/job-${String(index)}.mjs`,
    );
    const kinds = Object.fromEntries(changes.map((change) => [change, 'entry-point']));
    const text = renderConsoleSummary(policyReport({ changes, kinds }), { color: false });

    expect(text.match(/dead-code check treats them as used/gu)).toHaveLength(1);
    expect(text.match(/layout\.entryPoints added:/gu)).toHaveLength(10);
    expect(text).toContain(
      '✖ No new code violations, but 10 unapproved policy changes fail the gate',
    );
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
    const lines = consoleLines(policyReport({ changes, kinds }));

    expect(lines.slice(3, 10)).toEqual([
      HEADING,
      `  ${changes[0]}`,
      `    ${POLICY_GUIDANCE.exception}`,
      `  ${changes[1]}`,
      `  ${changes[2]}`,
      `    ${POLICY_GUIDANCE.exclusion}`,
      `  ${TIGHTENED}`,
    ]);
    expect(lines.join('\n')).not.toContain('fix the findings instead');
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
      '  eslint/no-console src/a.js:12',
      '    Unexpected console statement',
      HEADING,
      ...ENTRY_BLOCK,
      `  ${TIGHTENED}`,
      UNAPPROVED,
      ACCEPT,
      '✖ 1 tool error',
      '  coverage (head): Error: unavailable',
      DIAGNOSTICS,
      '',
    ]);
    expect(result.summary.newEnforceableFindings).toBe(3);
  });

  it('does not present an incomplete policy-only run as clean', () => {
    const text = renderConsoleSummary(
      policyReport({ toolErrors: [{ tool: 'coverage', message: 'Error: unavailable' }] }),
      { color: false },
    );

    expect(text.split('\n').slice(0, 4)).toEqual([
      '',
      'Quality gate summary',
      '✖ No new code violations, but 2 unapproved policy changes fail the gate and the run is incomplete:',
      HEADING,
    ]);
    expect(text).toContain('✖ 1 tool error');
    expect(text).not.toContain('✓');
  });

  it('colors the policy-only headline as a failure', () => {
    const text = renderConsoleSummary(policyReport(), { color: true });

    expect(text).toContain('\u001B[1m\u001B[31m✖ No new code violations, but 2 unapproved');
    expect(text).toContain('\u001B[1m\u001B[31mQuality gate summary');
  });

  it('retains accepted changes without unapproved review instructions', () => {
    const lines = consoleLines(policyReport({ accepted: true, defects: [finding()] }));

    expect(lines).toEqual([
      '',
      'Quality gate summary',
      '✖ 1 new enforceable violation',
      '  eslint/no-console src/a.js:12',
      '    Unexpected console statement',
      ACCEPTED_HEADING,
      '  layout.entryPoints added: scripts/first.mjs',
      '  layout.entryPoints added: scripts/second.mjs',
      `  ${TIGHTENED}`,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('keeps one finding per change with the guidance and the digest in full diagnostics', () => {
    const text = renderTextReport(policyReport());
    const lines = text.split('\n').filter((line) => line.startsWith('nitpicker-config/'));

    expect(lines).toHaveLength(2);
    for (const [index, line] of lines.entries()) {
      expect(line).toContain(`nitpicker.config.json ${ENTRY_CHANGES[index]}. `);
      expect(line).toContain(POLICY_GUIDANCE['entry-point']);
      expect(line).toContain(`--accept-policy-change=${DIGEST}`);
      expect(line).toContain(`NITPICKER_ACCEPT_POLICY_CHANGE=${DIGEST}`);
    }
    expect(text).toContain(
      `${HEADING}\n  ${ENTRY_CHANGES[0]}\n  ${ENTRY_CHANGES[1]}\n  ${TIGHTENED}`,
    );
  });

  it('uses the fallback guidance only for a finding that carries no kind', () => {
    const lines = consoleLines(policyReport({ kinds: {} }));

    expect(lines.filter((line) => line.startsWith('    Changes the checking policy'))).toHaveLength(
      1,
    );
  });

  it('cannot be forged by an exception reason with line breaks or terminal escapes', () => {
    const reason =
      'ok)\n  Unapproved policy changes (nitpicker-config/policy-loosened): 0;\u001B[2K\u001B[31m';
    const change = `exception added: eslint/no-console for src/** (${reason})`;
    const result = policyReport({ changes: [change], kinds: { [change]: 'exception' } });
    const text = renderConsoleSummary(result, { color: false });

    expect(text).not.toContain('\u001B');
    expect(text.split('\n').filter((line) => line.includes('policy-loosened): 0'))).toEqual([
      '  exception added: eslint/no-console for src/** (ok) Unapproved policy changes ' +
        '(nitpicker-config/policy-loosened): 0;)',
    ]);
    expect(text.match(/policy-loosened\): 1;/gu)).toHaveLength(1);
  });
});
