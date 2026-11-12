import path from 'node:path';
import { run } from '../execution/go-process.mjs';
import { toolCommand } from '../execution/go-tools.mjs';
import { formatterOptions } from './go-formatters.mjs';
import { formatAdvice } from '../../../../shared/messages/format/format-advice.mjs';

const FORMAT_RULE = 'format';
const CHUNK = 400;
const FORMAT_STATUSES = [0, 1, 2];

function gofmtCommand(context) {
  const goroot = run(context, ['go', 'env', 'GOROOT'], { rule: 'go-env-failed' }).stdout.trim();
  return [path.join(goroot, 'bin', 'gofmt')];
}

function commandOf(context, formatter) {
  return formatter === 'gofmt' ? gofmtCommand(context) : toolCommand(context, formatter);
}

function chunks(files) {
  return Array.from({ length: Math.ceil(files.length / CHUNK) }, (_, index) =>
    files.slice(index * CHUNK, (index + 1) * CHUNK),
  );
}

function optionsOf(context, formatter) {
  return formatterOptions(context.policyRoot, formatter, context.toolPrecedence?.[formatter]);
}

export function unformattedFiles(context, formatter, files) {
  const command = [...commandOf(context, formatter), ...optionsOf(context, formatter)];
  const listed = chunks(files).flatMap((chunk) => {
    const result = run(context, [...command, '-l', ...chunk], {
      rule: 'go-format-failed',
      accepted: FORMAT_STATUSES,
    });
    return result.stdout.split(/\r?\n/u).filter((line) => line.trim() !== '');
  });
  return [...new Set(listed.map((file) => file.split(path.sep).join('/')))].sort();
}

function formatMessage(context, formatter) {
  const from = context.formatting.from;
  const detected = from === undefined ? '' : ` (the project's formatter, from ${from})`;
  const command = [formatter, ...optionsOf(context, formatter), '-w'].join(' ');
  return `File is not formatted with ${formatter}${detected}. ${formatAdvice(command)}`;
}

export function formatFindings(context, { formatter, files }) {
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
