import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { requiredFields, requiredText } from './json/fields.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

const WIDTH = 100;

export const ACTION_BLOCK_START = '<!-- generated:action-inputs begin (npm run gen:checks) -->';

export const ACTION_BLOCK_END = '<!-- generated:action-inputs end -->';

function readAction(): unknown {
  return parse(readFileSync(path.join(repositoryRoot, 'action.yml'), 'utf8'));
}

function wrapped(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.match(/`[^`]*`\S*|\S+/gu) ?? []) {
    if (line !== '' && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = `  ${word}`;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  return [...lines, line];
}

function description(entry: unknown, name: string): string {
  return requiredText(requiredFields(entry, name)['description'], `${name}.description`).trim();
}

function inputItem([name, input]: [string, unknown]): string[] {
  const value = String(requiredFields(input, name)['default']);
  const preset = value === '' ? 'empty by default' : `default \`${value}\``;
  return wrapped(`- \`${name}\` (${preset}): ${description(input, name)}`);
}

function outputItem([name, output]: [string, unknown]): string[] {
  return wrapped(`- \`${name}\`: ${description(output, name)}`);
}

function entriesOf(action: unknown, key: string): [string, unknown][] {
  return Object.entries(requiredFields(requiredFields(action, 'action.yml')[key], key));
}

export function renderActionReference(action: unknown = readAction()): string {
  return [
    'Inputs:',
    '',
    ...entriesOf(action, 'inputs').flatMap(inputItem),
    '',
    'Outputs:',
    '',
    ...entriesOf(action, 'outputs').flatMap(outputItem),
  ].join('\n');
}

export function applyActionReference(text: string): string {
  const start = text.indexOf(ACTION_BLOCK_START);
  const end = text.indexOf(ACTION_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `docs/ci.md must contain the markers ${ACTION_BLOCK_START} and ${ACTION_BLOCK_END}`,
    );
  }
  return `${text.slice(0, start + ACTION_BLOCK_START.length)}\n\n${renderActionReference()}\n\n${text.slice(end)}`;
}
