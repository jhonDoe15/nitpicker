import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textsOf } from '../../../shared/values/readers.mts';
import { placeFile } from './place-file.mts';
import { workflowParts } from './ci-steps.mts';
import { yamlScalar } from './workflow/yaml-steps.mts';
import type { WorkflowContext } from '../init-types.mts';
import type { PlacedFile } from '../init-report.mts';

type WorkflowDocument = { readonly content: string; readonly notes: readonly string[] };

const placeFileOf: (request: {
  readonly root: string;
  readonly relative: string;
  readonly content: string;
}) => PlacedFile = placeFile;

const TEMPLATE = fileURLToPath(new URL('../templates/github-workflow.yml', import.meta.url));
const APPROVAL_TEMPLATE = fileURLToPath(
  new URL('../templates/github-policy-approval.yml', import.meta.url),
);
const WORKFLOWS = '.github/workflows';
export const APPROVAL_WORKFLOW = `${WORKFLOWS}/nitpicker-policy-approval.yml`;
const TOKEN = /'\{\{(\w+)\}\}'/u;
const PLAIN_SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const SEGMENT_SEPARATOR = '--';
const DIGEST_LENGTH = 8;

function projectPath(projectRoot: string, repository: string): string {
  return path.relative(repository, projectRoot).split(path.sep).join('/');
}

function segmentSlug(segment: string): string {
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

function slugOf(relative: string): string {
  return relative.split('/').map(segmentSlug).join(SEGMENT_SEPARATOR);
}

export function workflowPath(projectRoot: string, repository: string): string {
  const relative = projectPath(projectRoot, repository);
  return relative === ''
    ? `${WORKFLOWS}/nitpicker.yml`
    : `${WORKFLOWS}/nitpicker-${slugOf(relative)}.yml`;
}

function defaultsLines(runDefaults: Readonly<Record<string, unknown>>): string[] {
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

function namedParts(
  projectRoot: string,
  repository: string,
  runDefaults: Readonly<Record<string, unknown>>,
): { readonly NAME: string; readonly DEFAULTS: string[] } {
  const relative = projectPath(projectRoot, repository);
  const folder = relative === '' ? {} : { 'working-directory': relative };
  return {
    NAME: relative === '' ? 'nitpicker' : `nitpicker (${relative})`,
    DEFAULTS: defaultsLines({ ...folder, ...runDefaults }),
  };
}

function expanded(line: string, parts: Readonly<Record<string, unknown>>): string[] {
  const name = TOKEN.exec(line)?.[1];
  if (name === undefined) {
    return [line];
  }
  const value = parts[name];
  return Array.isArray(value)
    ? textsOf(value)
    : [line.replace(TOKEN, () => String(yamlScalar(value)))];
}

function workflowDocument(projectRoot: string, context: WorkflowContext): WorkflowDocument {
  const { runDefaults, notes, ...steps } = workflowParts(projectRoot, context);
  const parts = { ...steps, ...namedParts(projectRoot, context.repository, runDefaults) };
  const lines = readFileSync(TEMPLATE, 'utf8').trimEnd().split('\n');
  return { content: `${lines.flatMap((line) => expanded(line, parts)).join('\n')}\n`, notes };
}

export function renderWorkflow(projectRoot: string, context: WorkflowContext): string {
  return workflowDocument(projectRoot, context).content;
}

export function placeWorkflow(projectRoot: string, context: WorkflowContext): PlacedFile {
  const { content, notes } = workflowDocument(projectRoot, context);
  const placed = placeFileOf({
    root: context.repository,
    relative: workflowPath(projectRoot, context.repository),
    content,
  });
  return notes.length === 0 ? placed : { ...placed, notes };
}

export function placeApprovalWorkflow(repository: string): PlacedFile {
  return placeFileOf({
    root: repository,
    relative: APPROVAL_WORKFLOW,
    content: readFileSync(APPROVAL_TEMPLATE, 'utf8'),
  });
}
