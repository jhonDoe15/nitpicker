import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ANY_STATUS, failure, run } from '../execution/go-process.mjs';
import { diagnosticFindings, parsePosition } from './diagnostics.mjs';

export const VET_REPORT = 'vet.txt';
const COMPILE_RULE = 'compile-error';
const COMPILE_LINE = /^(?:vet: )?(\S+\.go:\d+(?::\d+)?): (.+)$/u;
const COMPILE_HINT = 'The code does not compile; fix it before anything else is checked.';

export function buildFlags(settings = {}) {
  return settings.buildTags === undefined || settings.buildTags.length === 0
    ? []
    : [`-tags=${settings.buildTags.join(',')}`];
}

export function vet(context) {
  const command = ['go', 'vet', '-json', ...buildFlags(context.settings), './...'];
  const result = run(context, command, { rule: 'go-vet-failed', accepted: ANY_STATUS });
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  if (result.status !== 0 && vetFindings(context.projectRoot, text).length === 0) {
    throw failure({ context, command, result, rule: 'go-vet-failed' });
  }
  writeFileSync(path.join(context.reportRoot, VET_REPORT), text);
}

function jsonBlocks(lines) {
  return lines.flatMap((line, start) => {
    const end = line === '{' ? lines.indexOf('}', start) : -1;
    return end === -1 ? [] : [lines.slice(start, end + 1).join('\n')];
  });
}

function analyzerDiagnostics(projectRoot, block) {
  return Object.values(JSON.parse(block)).flatMap((analyzers) =>
    Object.entries(analyzers).flatMap(([analyzer, entries]) =>
      (Array.isArray(entries) ? entries : []).flatMap(({ posn, message }) => {
        const position = parsePosition(projectRoot, posn ?? '');
        return position === undefined
          ? []
          : [{ tool: 'vet', rule: analyzer, ...position, message }];
      }),
    ),
  );
}

function compileDiagnostics(projectRoot, lines) {
  return lines.flatMap((line) => {
    const match = COMPILE_LINE.exec(line);
    const position = match === null ? undefined : parsePosition(projectRoot, match[1]);
    return position === undefined
      ? []
      : [
          {
            tool: 'build',
            rule: COMPILE_RULE,
            ...position,
            message: `${match[2]}. ${COMPILE_HINT}`,
          },
        ];
  });
}

export function vetFindings(projectRoot, text) {
  const lines = text.split(/\r?\n/u);
  return diagnosticFindings(projectRoot, [
    ...compileDiagnostics(projectRoot, lines),
    ...jsonBlocks(lines).flatMap((block) => analyzerDiagnostics(projectRoot, block)),
  ]);
}
