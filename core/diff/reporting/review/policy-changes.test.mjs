import { renderConsoleSummary } from '../summary.mjs';
import { renderTextReport } from '../text.mjs';
import { finding, report } from '../test-support/report-builders.mjs';
import { policyFindings } from './policy-findings.mjs';
import { describe, expect, it } from 'vitest';
import { appendPolicyChangeSummary, policyChangeSection } from './policy-changes.mjs';

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';

describe('policy change rendering', () => {
  it('renders nothing without changes', () => {
    const lines = ['kept'];
    appendPolicyChangeSummary(lines, { policyChanges: [] }, (text) => `<${text}>`);
    appendPolicyChangeSummary(lines, undefined, (text) => `<${text}>`);

    expect(policyChangeSection()).toEqual([]);
    expect(policyChangeSection({ policyChanges: [] })).toEqual([]);
    expect(lines).toEqual(['kept']);
  });

  it('renders a heading and one indented line per change', () => {
    const summary = { policyChanges: ['exclude added: a/**', 'analyzer disabled: mutation'] };
    const lines = [];
    appendPolicyChangeSummary(lines, summary, (text) => `<${text}>`);

    expect(policyChangeSection(summary)).toEqual([
      '',
      HEADING,
      '  exclude added: a/**',
      '  analyzer disabled: mutation',
    ]);
    expect(lines).toEqual([
      `<${HEADING}>`,
      '  exclude added: a/**',
      '  analyzer disabled: mutation',
    ]);
  });

  it('says in the heading that the loosening was accepted', () => {
    expect(
      policyChangeSection({ policyChanges: ['exclude added: a/**'], policyChangeAccepted: true }),
    ).toEqual([
      '',
      'Policy changed in this change (nitpicker.config.json, head against base; ' +
        'loosening accepted by exact digest):',
      '  exclude added: a/**',
    ]);
  });
});

const DIGEST = 'd1e2f3a4b5c6';
const ENTRY_CHANGES = [
  'layout.entryPoints added: scripts/first.mjs',
  'layout.entryPoints added: scripts/second.mjs',
];

function policyReport({ accepted = false, defects = [], toolErrors = [] } = {}) {
  const result = report({
    newFindings: [
      ...defects,
      ...policyFindings(ENTRY_CHANGES, DIGEST, accepted ? DIGEST : undefined),
    ],
    toolErrors,
  });
  Object.assign(result.summary, {
    policyChanges: [...ENTRY_CHANGES, 'threshold crapLimit lowered from 9 to 8'],
    policyLoosenings: ENTRY_CHANGES,
    policyDigest: DIGEST,
    policyChangeAccepted: accepted,
  });
  return result;
}

describe('console policy review', () => {
  it('explains two entrypoints once each with one shared review and digest block', () => {
    const result = policyReport();
    const text = renderConsoleSummary(result, { color: false });

    expect(text.match(/scripts\/first\.mjs/gu)).toHaveLength(1);
    expect(text.match(/scripts\/second\.mjs/gu)).toHaveLength(1);
    expect(text.match(/d1e2f3a4b5c6/gu)).toHaveLength(1);
    expect(text.match(/Only a person may accept/gu)).toHaveLength(1);
    expect(text).toMatchInlineSnapshot(`
      "
      Quality gate summary
      No new code violations; policy review is required below.
      Policy changed in this change (nitpicker.config.json, head against base):
        layout.entryPoints added: scripts/first.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.
        layout.entryPoints added: scripts/second.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.
        threshold crapLimit lowered from 9 to 8
        Unapproved policy changes: 2 (failing; separate from code violations).
        Correct unintended changes first using the guidance above. For intended changes, ask a person reviewing this change to verify the affected checks and scope.
        Review digest: d1e2f3a4b5c6
        Only a person may accept this exact digest: pass --accept-policy-change=<digest> at an interactive terminal, or set NITPICKER_ACCEPT_POLICY_CHANGE=<digest> in CI and rerun.
      Full diagnostics: reports/quality/diff/combined/report.txt
      "
    `);
    expect(text).not.toContain('✓');
    expect(text).not.toContain('keep new code under the source roots');
    expect(result.summary.newEnforceableFindings).toBe(2);
    expect(result.newFindings.map(({ identity }) => identity)).toEqual(ENTRY_CHANGES);
  });

  it('keeps code defects, policy review and incomplete analyzers distinct', () => {
    const result = policyReport({
      defects: [finding()],
      toolErrors: [{ tool: 'coverage', snapshot: 'head', message: 'Error: unavailable' }],
    });
    const text = renderConsoleSummary(result, { color: false });

    expect(text).toMatchInlineSnapshot(`
      "
      Quality gate summary
      ✖ 1 new enforceable violation
        eslint/no-console src/a.js:12
          Unexpected console statement
      Policy changed in this change (nitpicker.config.json, head against base):
        layout.entryPoints added: scripts/first.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.
        layout.entryPoints added: scripts/second.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.
        threshold crapLimit lowered from 9 to 8
        Unapproved policy changes: 2 (failing; separate from code violations).
        Correct unintended changes first using the guidance above. For intended changes, ask a person reviewing this change to verify the affected checks and scope.
        Review digest: d1e2f3a4b5c6
        Only a person may accept this exact digest: pass --accept-policy-change=<digest> at an interactive terminal, or set NITPICKER_ACCEPT_POLICY_CHANGE=<digest> in CI and rerun.
      ✖ 1 tool error
        coverage (head): Error: unavailable
      Full diagnostics: reports/quality/diff/combined/report.txt
      "
    `);
    expect(result.summary.newEnforceableFindings).toBe(3);
  });

  it('does not present an incomplete policy-only run as clean', () => {
    const text = renderConsoleSummary(
      policyReport({
        toolErrors: [{ tool: 'coverage', message: 'Error: unavailable' }],
      }),
      { color: false },
    );

    expect(text).toMatchInlineSnapshot(`
      "
      Quality gate summary
      No new code violations, but policy review is required and the run is incomplete:
      Policy changed in this change (nitpicker.config.json, head against base):
        layout.entryPoints added: scripts/first.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.
        layout.entryPoints added: scripts/second.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.
        threshold crapLimit lowered from 9 to 8
        Unapproved policy changes: 2 (failing; separate from code violations).
        Correct unintended changes first using the guidance above. For intended changes, ask a person reviewing this change to verify the affected checks and scope.
        Review digest: d1e2f3a4b5c6
        Only a person may accept this exact digest: pass --accept-policy-change=<digest> at an interactive terminal, or set NITPICKER_ACCEPT_POLICY_CHANGE=<digest> in CI and rerun.
      ✖ 1 tool error
        coverage: Error: unavailable
      Full diagnostics: reports/quality/diff/combined/report.txt
      "
    `);
    expect(text).not.toContain('✓');
  });

  it('retains accepted changes without unapproved review instructions', () => {
    const text = renderConsoleSummary(policyReport({ accepted: true, defects: [finding()] }), {
      color: false,
    });

    expect(text).toMatchInlineSnapshot(`
      "
      Quality gate summary
      ✖ 1 new enforceable violation
        eslint/no-console src/a.js:12
          Unexpected console statement
      Policy changed in this change (nitpicker.config.json, head against base; loosening accepted by exact digest):
        layout.entryPoints added: scripts/first.mjs
        layout.entryPoints added: scripts/second.mjs
        threshold crapLimit lowered from 9 to 8
      Full diagnostics: reports/quality/diff/combined/report.txt
      "
    `);
    expect(text.match(/scripts\/first\.mjs/gu)).toHaveLength(1);
    expect(text).not.toContain('Unapproved policy changes');
    expect(text).not.toContain('Only a person may accept');
  });

  it('retains independently understandable full diagnostics', () => {
    const text = renderTextReport(policyReport());

    expect(text).toMatchInlineSnapshot(`
      "Nitpicker quality diff
      Base ref: main
      Merge base: abc
      Head: def
      Status: completed
      New enforceable findings: 2
      New findings: 2
      Resolved findings: 0
      Unchanged findings: 0
      Changed metrics: 0
      Tool errors: 0

      Policy changed in this change (nitpicker.config.json, head against base):
        layout.entryPoints added: scripts/first.mjs
        layout.entryPoints added: scripts/second.mjs
        threshold crapLimit lowered from 9 to 8

      Per-tool counts:
      eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=0.040s

      New findings:
      nitpicker-config/policy-loosened nitpicker.config.json layout.entryPoints added: scripts/first.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply. If the policy change is intended, stop and ask a person reviewing this change: only they accept exactly these loosenings, with --accept-policy-change=d1e2f3a4b5c6 at an interactive terminal or NITPICKER_ACCEPT_POLICY_CHANGE=d1e2f3a4b5c6 in CI.
      nitpicker-config/policy-loosened nitpicker.config.json layout.entryPoints added: scripts/second.mjs. Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply. If the policy change is intended, stop and ask a person reviewing this change: only they accept exactly these loosenings, with --accept-policy-change=d1e2f3a4b5c6 at an interactive terminal or NITPICKER_ACCEPT_POLICY_CHANGE=d1e2f3a4b5c6 in CI.
      "
    `);
    expect(text.match(/verify that invocation before review/gu)).toHaveLength(2);
    expect(text.match(/--accept-policy-change=d1e2f3a4b5c6/gu)).toHaveLength(2);
  });

  it('explains rule exceptions and exclusions with their different corrective actions', () => {
    const changes = [
      'exception added: eslint/no-console for src/** (reviewed)',
      'exclude added: vendor/**',
    ];
    const result = report({ newFindings: policyFindings(changes, DIGEST) });
    Object.assign(result.summary, { policyChanges: changes, policyDigest: DIGEST });
    const text = renderConsoleSummary(result, { color: false });

    expect(text).toMatchInlineSnapshot(`
      "
      Quality gate summary
      No new code violations; policy review is required below.
      Policy changed in this change (nitpicker.config.json, head against base):
        exception added: eslint/no-console for src/** (reviewed). Suppresses findings for the named rule on matching paths, so newly covered code needs review. Remove or narrow an unintended exception and fix the rule findings.
        exclude added: vendor/**. Removes matching paths from analyzed scope and filters their findings, so newly hidden code needs review. Remove or narrow an unintended exclusion and fix the findings.
        Unapproved policy changes: 2 (failing; separate from code violations).
        Correct unintended changes first using the guidance above. For intended changes, ask a person reviewing this change to verify the affected checks and scope.
        Review digest: d1e2f3a4b5c6
        Only a person may accept this exact digest: pass --accept-policy-change=<digest> at an interactive terminal, or set NITPICKER_ACCEPT_POLICY_CHANGE=<digest> in CI and rerun.
      Full diagnostics: reports/quality/diff/combined/report.txt
      "
    `);
    expect(text.match(/exception added:/gu)).toHaveLength(1);
    expect(text.match(/exclude added:/gu)).toHaveLength(1);
  });
});
