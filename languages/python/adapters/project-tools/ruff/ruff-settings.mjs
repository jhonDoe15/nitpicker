import { realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execute } from '../../execution/python-process.mjs';

const PROBE = 'nitpicker-ruff-probe.py';
const CODE = /\(([A-Z]+\d+)\)/gu;
const IGNORE_ENTRY =
  /absolute_matcher = (".*")\nbasename_matcher = (".*")\nnegated = (true|false)\ndata = \[([^\]]*)\]/gu;

function block(output, heading, close) {
  const start = output.indexOf(`\n${heading} = `);
  if (start === -1) {
    return undefined;
  }
  const end = output.indexOf(`\n${close}`, start + 1);
  return end === -1 ? undefined : output.slice(start, end);
}

function codesIn(text) {
  return [...text.matchAll(CODE)].map(([, code]) => code);
}

function inSnapshot(absolute, { configRoot, projectRoot }) {
  const offset = path.relative(configRoot, absolute);
  return offset.startsWith('..') || path.isAbsolute(offset)
    ? absolute
    : path.join(projectRoot, offset).split(path.sep).join('/');
}

function ignoreEntry([, absolute, basename, negated, data], roots) {
  const base = JSON.parse(basename);
  const pattern = /[/\\]/u.test(base) ? inSnapshot(JSON.parse(absolute), roots) : base;
  return { pattern: `${negated === 'true' ? '!' : ''}${pattern}`, codes: codesIn(data) };
}

function parsedSettings(output, roots) {
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

export function resolvedLint(context, { file, configRoot = context.reportRoot, preview = true }) {
  const probe = path.join(context.reportRoot, PROBE);
  writeFileSync(probe, '');
  const command = [
    'ruff',
    'check',
    '--show-settings',
    '--config',
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
    const reason = (result.stderr ?? result.error?.message ?? '').trim();
    throw new Error(
      `ruff could not resolve the lint settings of ${file} (${command.slice(0, 4).join(' ')}): ${reason}`,
    );
  }
  return settings;
}
