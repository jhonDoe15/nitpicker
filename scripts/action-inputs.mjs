import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

const WIDTH = 100;

export const ACTION_BLOCK_START = '<!-- generated:action-inputs begin (npm run gen:checks) -->';

export const ACTION_BLOCK_END = '<!-- generated:action-inputs end -->';

function readAction() {
  return parse(readFileSync(path.join(repositoryRoot, 'action.yml'), 'utf8'));
}

function wrapped(text) {
  const lines = [];
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

function inputItem([name, input]) {
  const preset = input.default === '' ? 'empty by default' : `default \`${input.default}\``;
  return wrapped(`- \`${name}\` (${preset}): ${input.description.trim()}`);
}

function outputItem([name, output]) {
  return wrapped(`- \`${name}\`: ${output.description.trim()}`);
}

export function renderActionReference(action = readAction()) {
  return [
    'Inputs:',
    '',
    ...Object.entries(action.inputs).flatMap(inputItem),
    '',
    'Outputs:',
    '',
    ...Object.entries(action.outputs).flatMap(outputItem),
  ].join('\n');
}

export function applyActionReference(text) {
  const start = text.indexOf(ACTION_BLOCK_START);
  const end = text.indexOf(ACTION_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `docs/ci.md must contain the markers ${ACTION_BLOCK_START} and ${ACTION_BLOCK_END}`,
    );
  }
  return `${text.slice(0, start + ACTION_BLOCK_START.length)}\n\n${renderActionReference()}\n\n${text.slice(end)}`;
}
