import { TROUBLESHOOTING_FILE } from '../../shared/messages/troubleshooting.mjs';

const WIDTH = 100;

export const TROUBLESHOOTING = `[troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/${TROUBLESHOOTING_FILE})`;
export const REPORT_FOLDER = 'reports/quality/diff/';

export const QUICK_SENTENCE =
  'While you iterate, run `npx nitpicker --quick`: it skips the tests and the checks built on ' +
  'them; read the printed skipped list for what it left out. ';
export const NARROWED_SENTENCE =
  '`--analyzer <name>` runs one analyzer only, which is faster still. A run narrowed with ' +
  '`--quick` or `--analyzer` is never a pass: finish with the full run below, without them.';
export const NO_PIPE =
  'as a background command you wait on, without a pipe: you need its exit code. Wait for it: do ' +
  'not start a second run or kill it';
export const HELD_NOTE =
  'A note such as `Note: 1 existing lint finding in edited code (not failing, no more than ' +
  'before)` or a "Touched, still over limit" list names held findings in code you edited. It ' +
  'never fails the run: leave that code alone.';
export const REPORT_FILES =
  `If the console output is cut off, read \`${REPORT_FOLDER}report.txt\`, then ` +
  '`new-findings.json` and `tool-errors.json` in the same folder.';
export const EXCEPTION_ENTRY =
  'Code that is right despite a rule: a finding message may end with the `exceptions` entry ' +
  'that would accept it (`If this is intended, add {...} to "exceptions" in ' +
  'nitpicker.config.json.`). That entry is for a human reviewer. Never add one, and never fill ' +
  'in its `reason`, to get past the gate: stop and ask a human, and quote the finding with its entry.';
export const POLICY_STOP =
  'If a finding seems wrong, stop and ask. Never pass `--accept-policy-change`, set ' +
  '`NITPICKER_ACCEPT_POLICY_CHANGE` or add the `accept-policy-change` label: a ' +
  '`nitpicker-config/policy-loosened` finding is for a person to accept.';
export const EXPLAIN =
  'To learn why a rule is on and what form it allows before you write or change code, run ' +
  '`npx nitpicker explain <tool/rule>` with the name a finding prints, or read the ' +
  '[rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md). ' +
  "`npx nitpicker rules` lists the rules of this project's preset.";

const UNBREAKABLE = /\[[^\]]*\]\([^)]*\)|`[^`]*`/gu;
const SPACE_MARK = '\u0000';

export function numbered(position: number): string {
  return `${String(position)}. `;
}

function words(text: string): string[] {
  return text
    .replaceAll(UNBREAKABLE, (span) => span.replaceAll(' ', SPACE_MARK))
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word) => word.replaceAll(SPACE_MARK, ' '));
}

export function wrap(text: string, indent = '', firstIndent = indent): string {
  const lines: string[] = [];
  let line = firstIndent;
  let empty = true;
  for (const word of words(text)) {
    if (!empty && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = indent + word;
    } else {
      line += (empty ? '' : ' ') + word;
    }
    empty = false;
  }
  lines.push(line);
  return lines.join('\n');
}
