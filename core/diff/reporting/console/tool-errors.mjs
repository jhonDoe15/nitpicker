import { singleLine } from '../format/text.mjs';
import {
  toolErrorHelpLine,
  troubleshootingLinkOf,
} from '../../../../shared/messages/troubleshooting.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../shared/rules/finding-helpers.mjs';
import { ANSI, pluralize, style } from './style.mjs';

const ERROR_HEADLINE_LIMIT = 300;
const ERROR_LINE_PATTERN = /error TS\d+|Error:|ERR_|Cannot find|not found|ENOENT/u;

export function withoutSkipNotices(toolErrors) {
  const listedSnapshots = new Set(
    toolErrors.filter(({ rule }) => rule === TESTS_FAILED_RULE).map(({ snapshot }) => snapshot),
  );
  return toolErrors.filter(
    ({ rule, snapshot }) => rule !== TESTS_FAILED_SKIPPED_RULE || !listedSnapshots.has(snapshot),
  );
}

export function errorHeadline(message) {
  const link = troubleshootingLinkOf(String(message));
  const text = singleLine(String(message).replace(link ?? '', ''));
  const start = Math.max(text.search(ERROR_LINE_PATTERN), 0);
  const headline = text.slice(start, start + ERROR_HEADLINE_LIMIT).trimEnd();
  const shown =
    headline.length < text.length - start
      ? `${headline}… (full text in the diagnostics file)`
      : headline;
  return link === undefined ? shown : `${shown} ${link}`;
}

export function appendToolErrorSummary(lines, shown, { color }) {
  if (shown.length === 0) {
    return;
  }
  lines.push(
    style(
      `✖ ${String(shown.length)} ${pluralize('tool error', shown.length)}`,
      [ANSI.bold, ANSI.red],
      color,
    ),
  );
  for (const error of shown) {
    const label = error.snapshot === undefined ? error.tool : `${error.tool} (${error.snapshot})`;
    if (error.rule === undefined) {
      lines.push(`  ${style(label, [ANSI.yellow], color)}: ${errorHeadline(error.message)}`);
      continue;
    }
    const [first, ...rest] = String(error.message).split('\n');
    lines.push(
      `  ${style(label, [ANSI.yellow], color)}: ${first}`,
      ...rest.map((line) => `  ${line}`),
    );
  }
  const help = toolErrorHelpLine(shown.map(({ message }) => message));
  if (help !== undefined) {
    lines.push(style(help, [ANSI.dim], color));
  }
}
