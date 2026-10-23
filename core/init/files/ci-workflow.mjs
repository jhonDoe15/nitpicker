import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeFile } from './place-file.mjs';
import { workflowParts, yamlScalar } from './ci-steps.mjs';

const TEMPLATE = fileURLToPath(new URL('../templates/github-workflow.yml', import.meta.url));
const WORKFLOWS = '.github/workflows';
const TOKEN = /'\{\{(\w+)\}\}'/u;

function projectPath(projectRoot, repository) {
  return path.relative(repository, projectRoot).split(path.sep).join('/');
}

function slugOf(relative) {
  return (
    relative
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, '') || 'project'
  );
}

export function workflowPath(projectRoot, repository) {
  const relative = projectPath(projectRoot, repository);
  return relative === ''
    ? `${WORKFLOWS}/nitpicker.yml`
    : `${WORKFLOWS}/nitpicker-${slugOf(relative)}.yml`;
}

function namedParts(projectRoot, repository) {
  const relative = projectPath(projectRoot, repository);
  if (relative === '') {
    return { NAME: 'nitpicker', DEFAULTS: [] };
  }
  return {
    NAME: `nitpicker (${relative})`,
    DEFAULTS: [
      '    defaults:',
      '      run:',
      `        working-directory: ${JSON.stringify(relative)}`,
    ],
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

export function renderWorkflow(projectRoot, context) {
  const parts = {
    ...workflowParts(projectRoot, context),
    ...namedParts(projectRoot, context.repository),
  };
  const lines = readFileSync(TEMPLATE, 'utf8').trimEnd().split('\n');
  return `${lines.flatMap((line) => expanded(line, parts)).join('\n')}\n`;
}

export function placeWorkflow(projectRoot, context) {
  return placeFile({
    root: context.repository,
    relative: workflowPath(projectRoot, context.repository),
    content: renderWorkflow(projectRoot, context),
  });
}
