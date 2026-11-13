import { SLOTS, type FixLoopSlots } from './fix-loop-slots.mts';
import { snippetParts } from './fix-loop-snippet.mts';
import {
  EXCEPTION_ENTRY,
  EXPLAIN,
  HELD_NOTE,
  NARROWED_SENTENCE,
  NO_PIPE,
  numbered,
  POLICY_STOP,
  QUICK_SENTENCE,
  REPORT_FILES,
  TROUBLESHOOTING,
  wrap,
} from './fix-loop-text.mts';

function exitCodes(slots: FixLoopSlots): string {
  const narrowed = slots.hasQuick ? '`--analyzer` or `--quick`' : '`--analyzer`';
  const reread = slots.hasFix ? ' Re-read the files `--fix` changed before editing them.' : '';
  const extra = slots.exit1 === undefined ? '' : ` ${slots.exit1}`;
  const lines = [
    `- 0: done, unless you narrowed the run with ${narrowed}: the summary then says ` +
      '`Ran only: ...` or names the skipped checks, and you run the gate again without them ' +
      'before you finish.',
    '- 1: fix the failing tests the summary leads with, every new finding (printed as ' +
      `\`<tool>/<rule> <path>:<line>\`) and any tool error listed below them.${extra}${reread} ` +
      'Then rerun.',
    `- 2: no new findings, but a tool failed. Fix the cause it names (${slots.exit2Cause}) and ` +
      'rerun. Exit 2 is never a pass. If it says another run is in progress, wait for that run; ' +
      `never kill it. When the message links to ${TROUBLESHOOTING}, the fix is there.`,
  ];
  return lines.map((line) => wrap(line, '     ', '   ')).join('\n');
}

function steps(slots: FixLoopSlots): string[] {
  const command = slots.hasFix ? 'npx nitpicker --fix' : 'npx nitpicker';
  const note = slots.exceptionNote === undefined ? '' : ` ${slots.exceptionNote}`;
  const simple = [
    slots.tests,
    ...(slots.formatStep === undefined ? [] : [slots.formatStep]),
    `When the change is complete, run \`${command}\` ${NO_PIPE}. ${slots.runDetail} ` +
      'It takes minutes and prints a progress line for each slow analyzer.',
  ];
  const wrapped = simple.map((item, index) => wrap(item, '   ', numbered(index + 1)));
  const after = simple.length + 1;
  return [
    ...wrapped,
    [
      `${numbered(after)}Act on the exit code:`,
      exitCodes(slots),
      '',
      wrap(REPORT_FILES, '   '),
      '',
      wrap(HELD_NOTE, '   '),
      '',
    ].join('\n'),
    wrap(`Never suppress: ${slots.suppress} ${POLICY_STOP}`, '   ', numbered(after + 1)),
    wrap(`${EXCEPTION_ENTRY}${note}`, '   ', numbered(after + 2)),
  ];
}

function renderGateSection(slots: FixLoopSlots): string {
  const intro = wrap(`${slots.hasQuick ? QUICK_SENTENCE : ''}${NARROWED_SENTENCE}`);
  const tail = [...slots.tail, EXPLAIN].map((paragraph) => wrap(paragraph)).join('\n\n');
  return `## Finish with the gate\n\n${intro}\n\n${steps(slots).join('\n')}\n\n${tail}\n`;
}

type Replacement = {
  readonly heading: string;
  readonly endPattern?: RegExp;
  readonly body: string;
};

function replaceFrom(text: string, { heading, endPattern, body }: Replacement): string {
  const start = text.indexOf(`${heading}\n`);
  if (start === -1) {
    throw new Error(`Missing heading ${heading}`);
  }
  const rest = text.slice(start + heading.length);
  const end = endPattern === undefined ? -1 : rest.search(endPattern);
  return `${text.slice(0, start)}${body}${end === -1 ? '' : rest.slice(end)}`;
}

export function applySkillSection(preset: string): (text: string) => string {
  const slots = SLOTS.find((entry) => entry.preset === preset);
  if (slots === undefined) {
    throw new Error(`No fix loop slots for ${preset}`);
  }
  const section = {
    heading: '## Finish with the gate',
    endPattern: /\n## /u,
    body: renderGateSection(slots),
  };
  return (text) => replaceFrom(text, section);
}

export function applySnippetSections(text: string): string {
  const fixers = [...new Set(SLOTS.filter((slots) => slots.hasFix).map((slots) => slots.fixers))];
  return replaceFrom(text, { heading: '### Run it', body: `${snippetParts(fixers.join('; '))}\n` });
}
