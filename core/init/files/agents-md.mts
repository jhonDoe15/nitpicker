import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { insideProject, projectFileText, writableProjectFile } from '../support/inside-project.mjs';

type AgentsResult = { readonly relative: string; readonly status: string };

const insidePath: (root: string, relative: string) => string = insideProject;
const fileText: (root: string, relative: string) => string | undefined = projectFileText;
const writablePath: (root: string, relative: string) => string = writableProjectFile;

const SNIPPET_FILE = 'docs/agents-snippet.md';
const SNIPPET_SEPARATOR = '\n---\n';
export const INSTRUCTION_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md'];

export function readSnippet(packageRoot: string = PACKAGE_ROOT): string {
  const text = readFileSync(path.join(packageRoot, SNIPPET_FILE), 'utf8').replaceAll('\r\n', '\n');
  return text.slice(text.indexOf(SNIPPET_SEPARATOR) + SNIPPET_SEPARATOR.length).trim();
}

function snippetHeading(snippet: string): string {
  return snippet.split('\n')[0] ?? '';
}

function appended(existing: string | undefined, snippet: string): string {
  if (existing === undefined || existing.trim() === '') {
    return `${snippet}\n`;
  }
  const text = `${existing.trimEnd()}\n\n${snippet}\n`;
  return existing.includes('\r\n') ? text.replaceAll(/\r?\n/gu, '\r\n') : text;
}

export function hasSnippet(root: string, packageRoot: string = PACKAGE_ROOT): boolean {
  const heading = snippetHeading(readSnippet(packageRoot));
  return INSTRUCTION_FILES.some((name) => {
    const file = insidePath(root, name);
    return (
      statSync(file, { throwIfNoEntry: false })?.isFile() === true &&
      readFileSync(file, 'utf8').includes(heading)
    );
  });
}

export function appendSnippet(root: string, packageRoot: string = PACKAGE_ROOT): AgentsResult {
  const snippet = readSnippet(packageRoot);
  const heading = snippetHeading(snippet);
  const holder = INSTRUCTION_FILES.find((name) => fileText(root, name)?.includes(heading) === true);
  if (holder !== undefined) {
    return { relative: holder, status: 'unchanged' };
  }
  const target =
    INSTRUCTION_FILES.find((name) => fileText(root, name) !== undefined) ?? 'AGENTS.md';
  const existing = fileText(root, target);
  writeFileSync(writablePath(root, target), appended(existing, snippet));
  return { relative: target, status: existing === undefined ? 'created' : 'appended' };
}
