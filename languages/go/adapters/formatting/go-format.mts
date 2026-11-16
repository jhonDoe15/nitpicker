import path from 'node:path';
import { run } from '../execution/go-process.mts';
import { toolCommand } from '../execution/go-tools.mts';
import { formatterOptions } from './go-formatters.mts';
import { formatAdvice } from '../../../../shared/messages/format/format-advice.mjs';
import type { FindingRow, GoContext } from '../go-types.mts';

const FORMAT_RULE = 'format';
const CHUNK = 400;
const FORMAT_STATUSES = [0, 1, 2];

function gofmtCommand(context: GoContext) {
  const goroot = (
    run(context, ['go', 'env', 'GOROOT'], { rule: 'go-env-failed' }).stdout ?? ''
  ).trim();
  return [path.join(goroot, 'bin', 'gofmt')];
}

function commandOf(context: GoContext, formatter: string) {
  return formatter === 'gofmt' ? gofmtCommand(context) : toolCommand(context, formatter);
}

function chunks(files: readonly string[]) {
  return Array.from({ length: Math.ceil(files.length / CHUNK) }, (_, index) =>
    files.slice(index * CHUNK, (index + 1) * CHUNK),
  );
}

function optionsOf(context: GoContext, formatter: string) {
  return formatterOptions(context.policyRoot, formatter, context.toolPrecedence?.[formatter]);
}

export function formatterCommand(context: GoContext, formatter: string): string[] {
  return [...commandOf(context, formatter), ...optionsOf(context, formatter)];
}

export function unformattedFiles(
  context: GoContext,
  formatter: string,
  files: readonly string[],
): string[] {
  const command = formatterCommand(context, formatter);
  const listed = chunks(files).flatMap((chunk) => {
    const result = run(context, [...command, '-l', ...chunk], {
      rule: 'go-format-failed',
      accepted: FORMAT_STATUSES,
    });
    return (result.stdout ?? '').split(/\r?\n/u).filter((line) => line.trim() !== '');
  });
  return [...new Set(listed.map((file) => file.split(path.sep).join('/')))].sort();
}

function formatMessage(context: GoContext, formatter: string) {
  const from = context.formatting.from;
  const detected = from === undefined ? '' : ` (the project's formatter, from ${from})`;
  const command = [formatter, ...optionsOf(context, formatter), '-w'].join(' ');
  return `File is not formatted with ${formatter}${detected}. ${formatAdvice(command)}`;
}

export function formatFindings(
  context: GoContext,
  { formatter, files }: { formatter: string; files: readonly string[] },
): FindingRow[] {
  const message = formatMessage(context, formatter);
  return files.map((file) => ({
    tool: formatter,
    rule: FORMAT_RULE,
    path: file,
    identity: FORMAT_RULE,
    message,
    classification: 'enforceable',
  }));
}
