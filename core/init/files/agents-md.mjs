import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { projectFileText, writableProjectFile } from '../support/inside-project.mjs';

const SNIPPET_FILE = 'docs/agents-snippet.md';
const SNIPPET_SEPARATOR = '\n---\n';
export const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'];

export function readSnippet(packageRoot = PACKAGE_ROOT) {
  const text = readFileSync(path.join(packageRoot, SNIPPET_FILE), 'utf8').replaceAll('\r\n', '\n');
  return text.slice(text.indexOf(SNIPPET_SEPARATOR) + SNIPPET_SEPARATOR.length).trim();
}

function appended(existing, snippet) {
  if (existing === undefined || existing.trim() === '') {
    return `${snippet}\n`;
  }
  const text = `${existing.trimEnd()}\n\n${snippet}\n`;
  return existing.includes('\r\n') ? text.replaceAll(/\r?\n/gu, '\r\n') : text;
}

export function appendSnippet(root, packageRoot = PACKAGE_ROOT) {
  const snippet = readSnippet(packageRoot);
  const heading = snippet.split('\n')[0];
  const holder = INSTRUCTION_FILES.find((name) => projectFileText(root, name)?.includes(heading));
  if (holder !== undefined) {
    return { relative: holder, status: 'unchanged' };
  }
  const target =
    INSTRUCTION_FILES.find((name) => projectFileText(root, name) !== undefined) ?? 'AGENTS.md';
  const existing = projectFileText(root, target);
  writeFileSync(writableProjectFile(root, target), appended(existing, snippet));
  return { relative: target, status: existing === undefined ? 'created' : 'appended' };
}
