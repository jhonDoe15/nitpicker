import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ANY_STATUS, failure, run } from '../execution/go-process.mts';
import { diagnosticFindings, parsePosition } from './diagnostics.mts';
import {
  COMPILE_ERROR_RULE,
  COMPILE_ERROR_TOOL,
  compileErrorMessage,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  fieldOf,
  fieldsOf,
  listOf,
  parseJson,
  textOf,
} from '../../../../shared/values/readers.mts';
import type { Diagnostic, FindingRow, GoContext, GoSettings } from '../go-types.mts';

export const VET_REPORT = 'vet.txt';
const COMPILE_LINE = /^(?:vet: )?(\S+\.go:\d+(?::\d+)?): (.+)$/u;

export function buildFlags(settings: GoSettings = {}): string[] {
  const { buildTags } = settings;
  return buildTags === undefined || buildTags.length === 0 ? [] : [`-tags=${buildTags.join(',')}`];
}

export function vet(context: GoContext): void {
  const command = ['go', 'vet', '-json', ...buildFlags(context.settings), './...'];
  const result = run(context, command, { rule: 'go-vet-failed', accepted: ANY_STATUS });
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  if (result.status !== 0 && vetFindings(context.projectRoot, text).length === 0) {
    throw failure({ command, result, rule: 'go-vet-failed' });
  }
  writeFileSync(path.join(context.reportRoot, VET_REPORT), text);
}

function jsonBlocks(lines: readonly string[]) {
  return lines.flatMap((line, start) => {
    const end = line === '{' ? lines.indexOf('}', start) : -1;
    return end === -1 ? [] : [lines.slice(start, end + 1).join('\n')];
  });
}

function analyzerDiagnostics(projectRoot: string, block: string): Diagnostic[] {
  return Object.values(fieldsOf(parseJson(block))).flatMap((analyzers) =>
    Object.entries(fieldsOf(analyzers)).flatMap(([analyzer, entries]) =>
      listOf(entries).flatMap((entry) => {
        const posn = fieldOf(entry, 'posn');
        const position = parsePosition(projectRoot, typeof posn === 'string' ? posn : '');
        return position === undefined
          ? []
          : [
              {
                tool: 'vet',
                rule: analyzer,
                ...position,
                message: textOf(fieldOf(entry, 'message')),
              },
            ];
      }),
    ),
  );
}

function compileDiagnostics(projectRoot: string, lines: readonly string[]): Diagnostic[] {
  return lines.flatMap((line) => {
    const match = COMPILE_LINE.exec(line);
    const position = match === null ? undefined : parsePosition(projectRoot, match[1] ?? '');
    return position === undefined
      ? []
      : [
          {
            tool: COMPILE_ERROR_TOOL,
            rule: COMPILE_ERROR_RULE,
            ...position,
            message: compileErrorMessage(match?.[2] ?? ''),
          },
        ];
  });
}

export function readVetFindings(context: GoContext): FindingRow[] {
  return vetFindings(
    context.projectRoot,
    readFileSync(path.join(context.reportRoot, VET_REPORT), 'utf8'),
  );
}

export function vetFindings(projectRoot: string, text: string): FindingRow[] {
  const lines = text.split(/\r?\n/u);
  return diagnosticFindings(projectRoot, [
    ...compileDiagnostics(projectRoot, lines),
    ...jsonBlocks(lines).flatMap((block) => analyzerDiagnostics(projectRoot, block)),
  ]);
}
