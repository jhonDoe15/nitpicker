import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRootOf } from '../detection/repository.mjs';
import { placeFile } from './place-file.mjs';
import { workflowParts } from './ci-steps.mjs';

const TEMPLATE = fileURLToPath(new URL('../templates/github-workflow.yml', import.meta.url));
export const WORKFLOW_PATH = '.github/workflows/nitpicker.yml';
const TOKEN = /'\{\{(\w+)\}\}'/u;

function defaultsFor(projectRoot, repository) {
  const relative = path.relative(repository, projectRoot).split(path.sep).join('/');
  return relative === ''
    ? []
    : ['    defaults:', '      run:', `        working-directory: ${relative}`];
}

function expanded(line, parts) {
  const name = TOKEN.exec(line)?.[1];
  if (name === undefined) {
    return [line];
  }
  const value = parts[name];
  return Array.isArray(value) ? value : [line.replace(TOKEN, value)];
}

export function renderWorkflow(projectRoot, context, repository) {
  const parts = {
    ...workflowParts(projectRoot, context),
    DEFAULTS: defaultsFor(projectRoot, repository),
  };
  const lines = readFileSync(TEMPLATE, 'utf8').trimEnd().split('\n');
  return `${lines.flatMap((line) => expanded(line, parts)).join('\n')}\n`;
}

export function placeWorkflow(projectRoot, context) {
  const repository = repositoryRootOf(projectRoot) ?? projectRoot;
  return placeFile({
    root: repository,
    relative: WORKFLOW_PATH,
    content: renderWorkflow(projectRoot, context, repository),
  });
}
