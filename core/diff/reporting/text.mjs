import { sumToolCount, formatSeconds } from './format/text.mjs';
import { heldFindings, heldLine } from './format/held-findings.mjs';
import { noticeSection } from './review/notices.mjs';
import { policyChangeSection } from './review/policy-changes.mjs';
import { docsUrl } from '../../../shared/messages/docs-url.mjs';

export function renderTextReport(report) {
  const lines = [
    ...summaryLines(report),
    ...configOverrideLines(report.summary.configOverrides ?? []),
    ...policyChangeSection(report.summary),
    ...noticeSection(report.summary.notices),
    ...toolCountLines(report.summary.tools),
  ];
  appendFindingSection(lines, 'New findings', report.newFindings);
  appendRuleReference(lines, report.newFindings);
  appendHeldSection(lines, report.unchangedFindings);
  appendFindingSection(lines, 'Resolved findings', report.resolvedFindings);
  appendMetricSection(lines, report.changedMetrics);
  appendToolErrorSection(lines, report.toolErrors);
  return `${lines.join('\n')}\n`;
}

function summaryLines(report) {
  return [
    'Nitpicker quality diff',
    `Base ref: ${report.summary.requestedBaseRef}`,
    `Merge base: ${report.summary.mergeBaseSha}`,
    `Head: ${report.summary.headSha}`,
    `Status: ${report.summary.overallStatus}`,
    `New enforceable findings: ${String(report.summary.newEnforceableFindings)}`,
    `New findings: ${String(report.newFindings.length)}`,
    `Resolved findings: ${String(report.resolvedFindings.length)}`,
    `Unchanged findings: ${String(sumToolCount(report.summary.tools, 'unchanged'))}`,
    `Changed metrics: ${String(report.changedMetrics.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
  ];
}

function configOverrideLines(configOverrides) {
  if (configOverrides.length === 0) {
    return [];
  }
  return ['', 'Config overrides:', ...configOverrides.map((override) => `  ${override}`)];
}

function toolCountLines(tools) {
  if (tools.length === 0) {
    return ['Analyzers: none configured'];
  }
  return ['', 'Per-tool counts:', ...tools.map(toolCountLine)];
}

function toolCountLine(tool) {
  const skipped =
    tool.skippedBecause === undefined ? '' : ` skipped (${tool.skippedBecause} failed)`;
  const counts = `base=${tool.base} head=${tool.head} new=${tool.new} resolved=${tool.resolved}`;
  const unchanged = `unchanged=${tool.unchanged} changed-metrics=${tool.changedMetrics}`;
  return `${tool.name}: ${counts} ${unchanged} elapsed=${formatSeconds(tool.elapsedMs ?? 0)}${skipped}`;
}

export function renderRuleFilterSection(report, ruleFilters) {
  if (ruleFilters.length === 0) {
    return '';
  }
  function matches(finding) {
    return ruleFilters.some((filter) => `${finding.tool}/${finding.rule}`.includes(filter));
  }
  const lines = ['', `Findings matching --rule ${ruleFilters.join(', ')}:`];
  appendFindingSection(lines, '  New', report.newFindings.filter(matches));
  appendFindingSection(lines, '  Unchanged', report.unchangedFindings.filter(matches));
  appendFindingSection(lines, '  Resolved', report.resolvedFindings.filter(matches));
  return `${lines.join('\n')}\n`;
}

function appendFindingSection(lines, heading, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push('', `${heading}:`);
  for (const finding of findings) {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    lines.push(`${finding.tool}/${finding.rule} ${finding.path}${location} ${finding.message}`);
  }
}

function appendRuleReference(lines, findings) {
  if (findings.length > 0) {
    lines.push(
      '',
      `Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)`,
    );
  }
}

function appendHeldSection(lines, unchangedFindings) {
  const { metrics, lint } = heldFindings(unchangedFindings);
  if (metrics.length > 0) {
    lines.push('', 'Touched, still over limit (not failing):', ...metrics.map(heldLine));
  }
  if (lint.length > 0) {
    lines.push('', 'Existing lint findings in edited code (not failing):', ...lint.map(heldLine));
  }
}

function appendMetricSection(lines, metrics) {
  if (metrics.length === 0) {
    return;
  }
  lines.push('', 'Changed metrics:');
  for (const metric of metrics) {
    const change = `${metric.baseValue} -> ${metric.headValue} (${formatDelta(metric.delta)})`;
    lines.push(`${metric.tool}/${metric.rule} ${metric.path} ${metric.metric}: ${change}`);
  }
}

function appendToolErrorSection(lines, toolErrors) {
  if (toolErrors.length === 0) {
    return;
  }
  lines.push('', 'Tool errors:');
  for (const error of toolErrors) {
    lines.push(`${error.tool} (${error.snapshot}): ${error.message}`);
  }
}

function formatDelta(delta) {
  return delta > 0 ? `+${String(delta)}` : String(delta);
}
