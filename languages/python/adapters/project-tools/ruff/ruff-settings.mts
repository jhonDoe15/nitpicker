import { realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { execute } from '../../execution/python-process.mts';
import type { ToolContext } from '../../typed/context/tool-context-types.mts';
import type { IgnoreEntry, LintSettings, SnapshotRoots } from '../typed/ruff-types.mts';

type LintRequest = { file: string; configRoot: string; preview: boolean };

function reasonOf(stderr: string | undefined, message: string | undefined): string {
  return (stderr ?? message ?? '').trim();
}

const PROBE = 'nitpicker-ruff-probe.py';
const EMPTY: Readonly<Record<string, string>> = { ']': '[]', '}': '{}' };
const CODE = /\(([A-Z]+\d+)\)/gu;
const IGNORE_ENTRY =
  /absolute_matcher = (".*")\nbasename_matcher = (".*")\nnegated = (true|false)\ndata = \[([^\]]*)\]/gu;

function block(output: string, heading: string, close: string): string | undefined {
  const opening = `\n${heading} = `;
  const start = output.indexOf(opening);
  if (start === -1) {
    return undefined;
  }
  const rest = output.slice(start + opening.length);
  if (rest.startsWith(EMPTY[close] ?? '')) {
    return '';
  }
  const end = rest.indexOf(`\n${close}`);
  return end === -1 ? undefined : rest.slice(0, end);
}

function codesIn(text: string): string[] {
  return [...text.matchAll(CODE)].map(([, code]) => code ?? '');
}

function inSnapshot(absolute: string, { configRoot, projectRoot }: SnapshotRoots): string {
  const offset = path.relative(configRoot, absolute);
  return offset.startsWith('..') || path.isAbsolute(offset)
    ? absolute
    : path.join(projectRoot, offset).split(path.sep).join('/');
}

function ignoreEntry(
  [, absolute = '', basename = '', negated, data = '']: RegExpExecArray,
  roots: SnapshotRoots,
): IgnoreEntry {
  const base = textOf(parseJson(basename));
  const pattern = /[/\\]/u.test(base) ? inSnapshot(textOf(parseJson(absolute)), roots) : base;
  return { pattern: `${negated === 'true' ? '!' : ''}${pattern}`, codes: codesIn(data) };
}

function parsedSettings(output: string, roots: SnapshotRoots): LintSettings | undefined {
  const enabled = block(output, 'linter.rules.enabled', ']');
  const ignores = block(output, 'linter.per_file_ignores', '}');
  if (enabled === undefined || ignores === undefined) {
    return undefined;
  }
  return {
    enabled: new Set(codesIn(enabled)),
    perFileIgnores: [...`${ignores}\n`.matchAll(IGNORE_ENTRY)].map((entry) =>
      ignoreEntry(entry, roots),
    ),
  };
}

export function resolvedLint(
  context: ToolContext,
  { file, configRoot, preview }: LintRequest,
): LintSettings {
  const probe = path.join(context.reportRoot, PROBE);
  writeFileSync(probe, '');
  const shown = ['ruff', 'check', '--show-settings', '--config'];
  const command = [
    ...shown,
    file,
    ...(preview ? [] : ['--no-preview']),
    '--no-force-exclude',
    probe,
  ];
  const result = execute(context, command, { cwd: configRoot });
  const roots = { configRoot: realpathSync(configRoot), projectRoot: context.projectRoot };
  const settings =
    result.error === undefined && result.status === 0
      ? parsedSettings(result.stdout, roots)
      : undefined;
  if (settings === undefined) {
    const reason = reasonOf(result.stderr, result.error?.message);
    throw new Error(
      `ruff could not resolve the lint settings of ${file} (${shown.join(' ')}): ${reason}`,
    );
  }
  return settings;
}
