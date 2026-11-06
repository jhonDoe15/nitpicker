import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeFile } from './place-file.mjs';
import { workflowParts, yamlScalar } from './ci-steps.mjs';

const TEMPLATE = fileURLToPath(new URL('../templates/github-workflow.yml', import.meta.url));
const WORKFLOWS = '.github/workflows';
const TOKEN = /'\{\{(\w+)\}\}'/u;
const PLAIN_SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const SEGMENT_SEPARATOR = '--';
const DIGEST_LENGTH = 8;

function projectPath(projectRoot, repository) {
  return path.relative(repository, projectRoot).split(path.sep).join('/');
}

function segmentSlug(segment) {
  if (PLAIN_SEGMENT.test(segment)) {
    return segment;
  }
  const readable = segment
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '');
  const digest = createHash('sha256').update(segment).digest('hex').slice(0, DIGEST_LENGTH);
  return readable === '' ? digest : `${readable}-${digest}`;
}

function slugOf(relative) {
  return relative.split('/').map(segmentSlug).join(SEGMENT_SEPARATOR);
}

export function workflowPath(projectRoot, repository) {
  const relative = projectPath(projectRoot, repository);
  return relative === ''
    ? `${WORKFLOWS}/nitpicker.yml`
    : `${WORKFLOWS}/nitpicker-${slugOf(relative)}.yml`;
}

function defaultsLines(runDefaults) {
  const entries = Object.entries(runDefaults);
  if (entries.length === 0) {
    return [];
  }
  return [
    '    defaults:',
    '      run:',
    ...entries.map(([key, value]) => `        ${key}: ${JSON.stringify(value)}`),
  ];
}

function namedParts(projectRoot, repository, runDefaults) {
  const relative = projectPath(projectRoot, repository);
  const folder = relative === '' ? {} : { 'working-directory': relative };
  return {
    NAME: relative === '' ? 'nitpicker' : `nitpicker (${relative})`,
    DEFAULTS: defaultsLines({ ...folder, ...runDefaults }),
  };
}

function expanded(line, parts) {
  const name = TOKEN.exec(line)?.[1];
  if (name === undefined) {
    return [line];
  }
  const value = parts[name];
  return Array.isArray(value) ? value : [line.replace(TOKEN, () => String(yamlScalar(value)))];
}

function workflowDocument(projectRoot, context) {
  const { runDefaults, notes, ...steps } = workflowParts(projectRoot, context);
  const parts = { ...steps, ...namedParts(projectRoot, context.repository, runDefaults) };
  const lines = readFileSync(TEMPLATE, 'utf8').trimEnd().split('\n');
  return { content: `${lines.flatMap((line) => expanded(line, parts)).join('\n')}\n`, notes };
}

export function renderWorkflow(projectRoot, context) {
  return workflowDocument(projectRoot, context).content;
}

export function placeWorkflow(projectRoot, context) {
  const { content, notes } = workflowDocument(projectRoot, context);
  const placed = placeFile({
    root: context.repository,
    relative: workflowPath(projectRoot, context.repository),
    content,
  });
  return notes.length === 0 ? placed : { ...placed, notes };
}
